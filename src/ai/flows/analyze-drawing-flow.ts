
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
  prompt: `You are an expert architectural plan analyst specializing in cabinetry BOM extraction.
  
Analyze the provided PDF drawing. Your primary goal is to extract a Bill of Materials (BOM) for cabinetry, following these STRICT rules:

### 1. ROOM TITLE EXTRACTION RULES
- ONLY extract room titles from the MAIN HEADER BLOCK (usually top-left of each drawing page).
- A valid room title MUST contain:
  1. Builder Name (e.g., MI HOMES SARASOTA)
  2. Project Name (e.g., 4031 MAGNOLIA)
  3. Room Descriptor (e.g., STANDARD 42" KITCHEN, OWNERS BATH, BATH 2, OPT LAUNDRY)
  4. Orientation (e.g., GARAGE RIGHT)
- IGNORE footer shorthand/reference labels (e.g., "MIH 4031 MAGNOLIA STD 42 KITCHEN GR 1951").
- DO NOT treat the following as room titles:
  - HARDWARE, PERIMETER, BUMP, OPT CROWN, OPT LIGHT RAIL, TRIM LIST, INSTALLATION NOTE.
- Pages labeled "Trim List" are continuation pages of the PREVIOUS room and MUST NOT create new room entries.

### 2. ROOM CLASSIFICATION & LABELING
- LAUNDRY pages MUST be labeled exactly: "OPT LAUNDRY – [ORIENTATION] – [MODEL]" (e.g., OPT LAUNDRY – GARAGE RIGHT – 1951).
- HARDWARE items belong INSIDE the specific room they serve as a sub-section. 
- NEVER classify standalone Hardware or Trim pages as new Kitchen/Bath rooms.

### 3. CABINET EXTRACTION
- Extract every cabinet code (normalized: remove spaces/hyphens) and its quantity.
- Group items by the valid room title identified in Section 1.
- Use professional judgment for standard architectural notation.

### 4. NKBA VALIDATION
- Apply NKBA (National Kitchen & Bath Association) logic to identify clearance or spacing issues.
- Use provided NKBA Context if available: {{{nkbaContext}}}

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
