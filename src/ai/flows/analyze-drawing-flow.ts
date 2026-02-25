
'use server';
/**
 * @fileOverview AI flow for analyzing architectural PDF drawings.
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
  room_name: z.string().describe('Name of the section or room, e.g., Kitchen, Master Bath.'),
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
    room_name: z.string().describe('Name of the room, e.g. Kitchen'),
    room_type: z.string().describe('Type: Kitchen, Bath, Laundry, etc.'),
    code: z.string().describe('Cabinet code, e.g. B24'),
    qty: z.number().describe('Quantity'),
    type: z.string().describe('Category: Base, Wall, Tall, Vanity, etc.')
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
  output: { schema: FlatExtractionSchema }, // Use the flat schema for AI generation
  prompt: `You are an expert architectural plan analyst and cabinetry specialist.
  
Analyze the provided PDF drawing of a residential project. 
Your task is to extract a Bill of Materials (BOM) for the cabinetry required.

INSTRUCTIONS:
1. Identify all distinct rooms or sections (Kitchen, Bathrooms, etc.).
2. For each section, list every cabinet code and its quantity.
3. Normalize cabinet codes (e.g., if you see "B 24" make it "B24").
4. If the drawing is unclear, use your best professional judgment based on standard architectural notation.
5. Apply NKBA (National Kitchen & Bath Association) standard logic to identify potential issues:
   - Check for clearance around appliances.
   - Look for tight walkways.
   - Identify vanity placement issues.
6. Use the provided NKBA Context if available: {{{nkbaContext}}}

Drawing File: {{media url=pdfDataUri}}`,
});

const analyzeDrawingFlow = ai.defineFlow(
  {
    name: 'analyzeDrawingFlow',
    inputSchema: AnalyzeDrawingInputSchema,
    outputSchema: AnalyzeDrawingOutputSchema, // Returns the nested schema the UI expects
  },
  async (input) => {
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
