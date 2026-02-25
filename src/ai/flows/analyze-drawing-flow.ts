'use server';
/**
 * @fileOverview Production-Grade AI Flow for Architectural Cabinet Takeoff.
 * Uses a flat schema to avoid Gemini nesting depth errors.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FlatExtractionItemSchema = z.object({
  pageNumber: z.number().describe('The page number where the item was found.'),
  roomName: z.string().describe('The name of the room (e.g., Standard Kitchen, Owners Bath).'),
  section: z.enum(['wall', 'base', 'tall', 'vanity', 'hardware']).describe('Classification of the cabinet.'),
  code: z.string().describe('The cabinet SKU (e.g., W3042, B24).'),
  qty: z.number().describe('Quantity found on this page.'),
});

const AIOutputSchema = z.object({
  items: z.array(FlatExtractionItemSchema).describe('A flat list of all cabinet extractions found across all pages.'),
});

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
});

const AnalyzeDrawingOutputSchema = z.object({
  rooms: z.array(z.object({
    room_name: z.string(),
    room_type: z.string(),
    sections: z.object({
      'Wall Cabinets': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
      'Base Cabinets': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
      'Tall Cabinets': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
      'Vanity Cabinets': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
      'Hardware': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
    }),
  })),
  summary: z.string(),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

const prompt = ai.definePrompt({
  name: 'analyzeDrawingVisionPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: AIOutputSchema },
  prompt: `You are a professional architectural estimator specializing in cabinet takeoff. 
  
  TASK:
  Analyze the provided PDF drawing. This is a MULTI-PAGE document.
  You MUST process EVERY SINGLE PAGE provided. 
  
  PROCESS:
  1. Iterate through EVERY page of the PDF.
  2. IDENTIFY: Identify all cabinet codes (SKUs) in Floor Plans, Interior Elevations, and Cabinet Schedules.
  3. CLASSIFY: Assign a section to each code:
     - Starts with W -> wall
     - Starts with B or SB -> base
     - Starts with UF -> tall
     - Starts with VSB -> vanity
     - Fillers/Moldings -> hardware
  4. IGNORE: Do NOT extract electrical, lighting, HVAC, or plumbing fixtures.
  5. OUTPUT: Return a flat list of items.

  Rules for extraction:
  - Normalize codes: "B 24" -> "B24".
  - Detect specific rooms: "Standard Kitchen", "Owners Bath", "Laundry", etc.
  
  File: {{media url=pdfDataUri}}`,
});

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  const { output } = await prompt(input);
  
  if (!output || !output.items) {
    throw new Error('AI failed to return extraction items.');
  }

  // Aggregate the flat items into the room-wise structure server-side
  const roomsMap = new Map<string, any>();

  output.items.forEach((item) => {
    const roomKey = item.roomName || 'Other';
    
    if (!roomsMap.has(roomKey)) {
      roomsMap.set(roomKey, {
        room_name: roomKey,
        room_type: classifyRoomType(roomKey),
        sections: {
          'Wall Cabinets': [],
          'Base Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        }
      });
    }

    const room = roomsMap.get(roomKey);
    const sectionKey = mapSectionToLabel(item.section);
    
    // Check if code already exists in this section of this room to aggregate quantity
    const existing = room.sections[sectionKey].find((c: any) => c.code === item.code);
    if (existing) {
      existing.qty += item.qty;
    } else {
      room.sections[sectionKey].push({ 
        code: item.code, 
        qty: item.qty, 
        type: sectionKey 
      });
    }
  });

  const roomsList = Array.from(roomsMap.values());

  // Fallback if no items found
  if (roomsList.length === 0) {
    roomsList.push({
      room_name: 'Standard Kitchen',
      room_type: 'Kitchen',
      sections: {
        'Wall Cabinets': [],
        'Base Cabinets': [],
        'Tall Cabinets': [],
        'Vanity Cabinets': [],
        'Hardware': []
      }
    });
  }

  return {
    rooms: roomsList,
    summary: `Processed multiple pages. Extracted ${output.items.length} raw line items and aggregated into ${roomsMap.size} rooms.`
  };
}

function mapSectionToLabel(section: string): string {
  switch (section) {
    case 'wall': return 'Wall Cabinets';
    case 'base': return 'Base Cabinets';
    case 'tall': return 'Tall Cabinets';
    case 'vanity': return 'Vanity Cabinets';
    default: return 'Hardware';
  }
}

function classifyRoomType(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('BATH') || n.includes('POWDER')) return 'Bathroom';
  if (n.includes('LAUNDRY')) return 'Laundry';
  return 'Kitchen';
}
