'use server';
/**
 * @fileOverview AI flow for analyzing architectural PDF drawings with strict title rules.
 *
 * - analyzeDrawing - Main function to process PDF and extract cabinet BOM.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// The nested schema expected by the UI and DB
const CabinetSchema = z.object({
  code: z.string().describe('The cabinet SKU or model code, e.g., B24, W3012.'),
  qty: z.number().describe('The quantity of this cabinet found in the section.'),
  type: z.string().describe('The functional category of the cabinet (Base, Wall, Tall, Vanity, Other).'),
});

const RoomSchema = z.object({
  room_name: z.string().describe('Name of the section or room, following strict header rules.'),
  room_type: z.string().describe('Type of room: Kitchen, Bathroom, Laundry, Pantry, Other.'),
  cabinets: z.array(CabinetSchema),
});

const AnalyzeDrawingOutputSchema = z.object({
  rooms: z.array(RoomSchema),
  nkba_flags: z.array(z.string()).describe('Potential NKBA rule violations or spacing anomalies found in the drawing.'),
  summary: z.string().describe('A brief professional summary of the extraction.'),
});

// A FLATTENED schema for the AI output to avoid nesting depth errors in Gemini
const FlatExtractionSchema = z.object({
  cabinet_list: z.array(z.object({
    room_name: z.string().describe('Full validated room title from Header Block.'),
    room_type: z.string().describe('Kitchen, Bath, Laundry, etc.'),
    code: z.string().describe('Cabinet code, normalized.'),
    qty: z.number().describe('Quantity'),
    type: z.string().describe('Base, Wall, Tall, Vanity, Hardware')
  })),
  nkba_flags: z.array(z.string()).describe('NKBA violations or anomalies'),
  summary: z.string().describe('Brief professional summary')
});

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF of the architectural drawing as a data URI. Expected format: 'data:application/pdf;base64,<encoded_data>'."),
  nkbaContext: z.string().optional().describe('Text context from NKBA standards for validation.'),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  return analyzeDrawingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeDrawingPrompt',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: FlatExtractionSchema },
  prompt: `You are an expert architectural plan analyst. 
  
Analyze the provided PDF drawing to extract a Bill of Materials (BOM) for cabinetry.

### RULES
1. ROOM TITLES: Only extract titles from the MAIN HEADER BLOCK (top-left of each page).
   - Valid titles MUST include Builder, Project, Room, and Orientation (e.g., MI HOMES - 4031 MAGNOLIA - KITCHEN - GR).
   - Ignore small footer reference labels.
2. CONTINUATION: Pages like "Trim List" are continuations of the previous room; do NOT create a new room entry.
3. CABINETS: Extract every cabinet code (e.g., B24, W3612) and its quantity.
4. HARDWARE: Group hardware items inside the room they serve.
5. NKBA: Identify clearance issues or spacing anomalies.

Drawing File: {{media url=pdfDataUri}}`,
});

const analyzeDrawingFlow = ai.defineFlow(
  {
    name: 'analyzeDrawingFlow',
    inputSchema: AnalyzeDrawingInputSchema,
    outputSchema: AnalyzeDrawingOutputSchema,
  },
  async (input) => {
    // Call the AI with a strict timeout internal to the prompt if needed
    const { output } = await prompt(input);
    if (!output) throw new Error('AI failed to extract data from the drawing.');

    // Restructure flat AI output into the nested structure expected by the UI
    const roomsMap = new Map<string, any>();
    
    output.cabinet_list.forEach((item: any) => {
      const roomKey = item.room_name;
      if (!roomsMap.has(roomKey)) {
        roomsMap.set(roomKey, {
          room_name: item.room_name,
          room_type: item.room_type,
          cabinets: []
        });
      }
      roomsMap.get(roomKey).cabinets.push({
        code: item.code,
        qty: item.qty,
        type: item.type
      });
    });

    return {
      rooms: Array.from(roomsMap.values()),
      nkba_flags: output.nkba_flags,
      summary: output.summary
    };
  }
);
