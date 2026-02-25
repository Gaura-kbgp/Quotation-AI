
'use server';
/**
 * @fileOverview Production-Grade AI Flow for Architectural Cabinet Takeoff.
 * Uses Gemini 2.5 Flash for Hybrid Vision/Document analysis of multi-page PDFs.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CabinetItemSchema = z.object({
  code: z.string().describe('The cabinet SKU (e.g., W3042, B24, VSB36).'),
  qty: z.number().describe('Quantity of this cabinet found on the page.'),
  section: z.enum(['wall', 'base', 'tall', 'vanity', 'hardware']).describe('Classification of the cabinet.'),
});

const PageExtractionSchema = z.object({
  pageNumber: z.number(),
  roomName: z.string().describe('Detected room (e.g., Standard Kitchen, Owners Bath).'),
  pageType: z.enum(['CABINET_PAGE', 'IGNORE_PAGE']).describe('Whether this page contains relevant cabinet data.'),
  cabinets: z.array(CabinetItemSchema),
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

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

const prompt = ai.definePrompt({
  name: 'analyzeDrawingVisionPrompt',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: z.object({ extractions: z.array(PageExtractionSchema) }) },
  config: {
    model: 'googleai/gemini-2.5-flash',
  },
  prompt: `You are a professional architectural estimator specializing in cabinet takeoff. 
  
  TASK:
  Analyze every page of the provided PDF architectural drawing.
  
  PROCESS:
  1. Iterate through EVERY page of the PDF.
  2. CLASSIFY: Determine if the page is a Cabinet Page (Floor Plan, Schedule, Elevation, Kitchen/Bath Detail) or an Ignore Page (Electrical, HVAC, Lighting, HVAC, Cover).
  3. EXTRACT: On Cabinet Pages, identify all cabinet codes (SKUs). 
     - Include Wall (Wxxx), Base (Bxxx, SBxxx), Tall (UFxxx), Vanity (VSBxxx), and Fillers.
     - Include items from both Floor Plans and Interior Elevations.
     - Detect exact quantities.
  4. IGNORE: Do NOT extract electrical symbols, lighting fixtures, appliance labels (unless they are cabinet SKUs), or ceiling items.
  5. ROOMS: Detect the room name per page (e.g., Standard Kitchen, Owners Bath, Bath 2, Laundry).
  
  RULES FOR CABINET CODES:
  - Normalize codes by removing internal spaces (e.g., "B 24" -> "B24").
  - Classification:
    - Starts with W -> wall
    - Starts with B or SB -> base
    - Starts with UF -> tall
    - Starts with VSB -> vanity
    - Others -> hardware (e.g., fillers, moldings)

  File: {{media url=pdfDataUri}}`,
});

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  const { output } = await prompt(input);
  if (!output || !output.extractions) throw new Error('AI failed to extract multi-page data.');

  // Aggregate room data across all pages
  const roomsMap = new Map<string, any>();

  output.extractions.forEach((page) => {
    if (page.pageType === 'IGNORE_PAGE') return;

    const roomKey = page.roomName || 'Other';
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
    page.cabinets.forEach((cab) => {
      const sectionKey = mapSectionToLabel(cab.section);
      const existing = room.sections[sectionKey].find((c: any) => c.code === cab.code);
      if (existing) {
        existing.qty += cab.qty;
      } else {
        room.sections[sectionKey].push({ code: cab.code, qty: cab.qty, type: sectionKey });
      }
    });
  });

  return {
    rooms: Array.from(roomsMap.values()),
    summary: `Extracted data from ${output.extractions.length} pages. Detected ${roomsMap.size} rooms.`
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
