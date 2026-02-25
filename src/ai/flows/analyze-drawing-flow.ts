'use server';
/**
 * @fileOverview Production-Grade AI Flow for Architectural Cabinet Takeoff.
 * Optimized for Gemini 2.5 Flash to avoid nesting depth and validation errors.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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

/**
 * Prompt defined with Gemini 2.5 Flash.
 * Uses a flat string output schema to bypass 'maximum nesting depth' errors in GenerationConfig.
 */
const prompt = ai.definePrompt({
  name: 'analyzeDrawingVisionPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: z.string() },
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
  5. OUTPUT: Return a raw JSON array of objects.
  
  Format:
  [
    { "page": 1, "room": "Standard Kitchen", "section": "wall", "code": "W3042", "qty": 1 },
    ...
  ]

  Rules for extraction:
  - Normalize codes: "B 24" -> "B24".
  - Detect specific rooms: "Standard Kitchen", "Owners Bath", "Laundry", etc.
  
  IMPORTANT: Return ONLY the raw JSON array. No markdown, no backticks.
  
  File: {{media url=pdfDataUri}}`,
});

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  const { text } = await prompt(input);
  
  if (!text) {
    throw new Error('AI failed to return extraction data. The model may have blocked the content or timed out.');
  }

  // Manually parse the JSON to bypass nesting depth errors in API config
  let items: any[] = [];
  try {
    // Clean potential markdown or whitespace
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    items = JSON.parse(cleanedText);
  } catch (e) {
    console.error('[AI Parser] JSON Parse Error:', e);
    console.error('[AI Parser] Raw Text:', text);
    throw new Error('AI returned invalid data format. Please try again.');
  }

  // Aggregate the flat items into the room-wise structure server-side
  const roomsMap = new Map<string, any>();

  items.forEach((item) => {
    const roomKey = item.room || 'Other';
    
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
      existing.qty += (item.qty || 1);
    } else {
      room.sections[sectionKey].push({ 
        code: item.code, 
        qty: (item.qty || 1), 
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
    summary: `Processed multiple pages using Gemini 2.5 Flash. Extracted ${items.length} raw line items and aggregated into ${roomsMap.size} rooms.`
  };
}

function mapSectionToLabel(section: string): string {
  const s = String(section).toLowerCase();
  switch (s) {
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
