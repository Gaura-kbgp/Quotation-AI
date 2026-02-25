
'use server';
/**
 * @fileOverview AI flow for analyzing architectural PDF drawings.
 *
 * - analyzeDrawing - Main function to process PDF and extract cabinet BOM.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CabinetSchema = z.object({
  code: z.string().describe('The cabinet SKU or model code, e.g., B24, W3012.'),
  qty: z.number().describe('The quantity of this cabinet found in the section.'),
  type: z.enum(['Base', 'Wall', 'Tall', 'Vanity', 'Other']).describe('The functional category of the cabinet.'),
});

const RoomSchema = z.object({
  room_name: z.string().describe('Name of the section or room, e.g., Kitchen, Master Bath.'),
  room_type: z.enum(['Kitchen', 'Bathroom', 'Laundry', 'Pantry', 'Other']),
  cabinets: z.array(CabinetSchema),
});

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF of the architectural drawing as a data URI. Expected format: 'data:application/pdf;base64,<encoded_data>'."),
  nkbaContext: z.string().optional().describe('Text context from NKBA standards for validation.'),
});

const AnalyzeDrawingOutputSchema = z.object({
  rooms: z.array(RoomSchema),
  nkba_flags: z.array(z.string()).describe('Potential NKBA rule violations or spacing anomalies found in the drawing.'),
  summary: z.string().describe('A brief professional summary of the extraction.'),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  return analyzeDrawingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeDrawingPrompt',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: AnalyzeDrawingOutputSchema },
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
    outputSchema: AnalyzeDrawingOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error('AI failed to extract data from the drawing.');
    return output;
  }
);
