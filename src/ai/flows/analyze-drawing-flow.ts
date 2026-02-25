'use server';
/**
 * @fileOverview AI flow for analyzing architectural PDF drawings.
 * Optimized for speed and minimal nesting depth.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CabinetSchema = z.object({
  code: z.string().describe('Cabinet SKU (e.g., B24, W3012).'),
  qty: z.number().describe('Quantity.'),
  type: z.string().describe('Category (Base, Wall, Tall, Vanity, Other).'),
});

const RoomSchema = z.object({
  room_name: z.string().describe('Validated room title from Main Header Block.'),
  room_type: z.string().describe('Kitchen, Bathroom, Laundry, Pantry, etc.'),
  cabinets: z.array(CabinetSchema),
});

const AnalyzeDrawingOutputSchema = z.object({
  rooms: z.array(RoomSchema),
  nkba_flags: z.array(z.string()).describe('Rule violations found.'),
  summary: z.string().describe('Professional extraction summary.'),
});

const FlatExtractionSchema = z.object({
  items: z.array(z.object({
    room_name: z.string(),
    room_type: z.string(),
    code: z.string(),
    qty: z.number(),
    type: z.string()
  })),
  nkba_flags: z.array(z.string()),
  summary: z.string()
});

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI."),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: z.infer<typeof AnalyzeDrawingInputSchema>): Promise<AnalyzeDrawingOutput> {
  return analyzeDrawingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeDrawingPrompt',
  input: { schema: AnalyzeDrawingInputSchema },
  output: { schema: FlatExtractionSchema },
  prompt: `Extract cabinet BOM from this architectural drawing.
  
RULES:
1. ROOM TITLES: Use ONLY the MAIN HEADER BLOCK (top-left). Valid titles must have Builder, Project, and Room orientation.
2. CONTINUATION: Pages like "Trim List" are part of the previous room.
3. CABINETS: Extract all SKU codes and quantities.
4. HARDWARE: Group inside the room they belong to.

File: {{media url=pdfDataUri}}`,
});

const analyzeDrawingFlow = ai.defineFlow(
  {
    name: 'analyzeDrawingFlow',
    inputSchema: AnalyzeDrawingInputSchema,
    outputSchema: AnalyzeDrawingOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error('AI failed to extract data.');

    const roomsMap = new Map<string, any>();
    output.items.forEach((item: any) => {
      const key = item.room_name;
      if (!roomsMap.has(key)) {
        roomsMap.set(key, { room_name: item.room_name, room_type: item.room_type, cabinets: [] });
      }
      roomsMap.get(key).cabinets.push({ code: item.code, qty: item.qty, type: item.type });
    });

    return {
      rooms: Array.from(roomsMap.values()),
      nkba_flags: output.nkba_flags,
      summary: output.summary
    };
  }
);
