'use server';
/**
 * @fileOverview High-Precision AI Flow for Deterministic Architectural Cabinet Takeoff.
 * Implements strict pattern matching, header-only room isolation, and vertical text merging.
 * Optimized for MI HOMES blueprint standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isValidCabinetSku, isExcludedItem, detectCategory } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("4031 MAGNOLIA"),
});
export type AnalyzeDrawingInput = z.infer<typeof AnalyzeDrawingInputSchema>;

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
      'Accessories': z.array(z.object({ code: z.string(), qty: z.number(), type: z.string() })),
    }),
  })),
  summary: z.string(),
  totalUnits: z.number(),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: AnalyzeDrawingInput): Promise<AnalyzeDrawingOutput> {
  console.log(`[AI Flow] Starting Deterministic Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator specializing in MI HOMES blueprints.
      
      TASK:
      Extract EVERY physical cabinet box SKU from the layout drawings.
      
      STEP 1: ROOM IDENTIFICATION (STRICT HEADER RULE)
      Extract room titles ONLY from the main blueprint header at the top/bottom right of each page.
      Header pattern:
      MI HOMES SARASOTA
      ${input.projectName}
      [ROOM NAME]
      GARAGE RIGHT/LEFT
      
      The line between "${input.projectName}" and "GARAGE RIGHT/LEFT" is the ONLY valid Room Title.
      ONLY include: STD 42 Kitchen, OPT Gourmet Kitchen, Owners Bath, Bath 2, Bath 3 Upstairs.
      EXCLUDE: OPT Laundry, Trim List pages, Hardware pages.
      IGNORE mid-page headings (e.g. "OPT LAUNDRY UPPERS", "PERIMETER"). If a title contains "UPPERS" or "TRIM", it is NOT a room name.
      
      STEP 2: CABINET EXTRACTION
      - Extract only physical cabinet boxes visible in layout.
      - MERGE vertical text: if characters like U, F, 3 are stacked vertically, combine them into "UF3".
      - Normalize SKU: Uppercase, remove {L}, {R}, "X 24 DP", "X 12 DP".
      - Only include items starting with: W, B, SB, V, VSB, VS, TP, UF, RR.
      
      STEP 3: EXCLUSIONS
      IGNORE: HOOD, RANGE, MICRO, FRIDGE, SINK, LIGHT, PRICING, DIMENSIONS, SHEET, MARCH.
      
      STEP 4: OUTPUT FORMAT
      Return ONLY a raw JSON array of objects. 
      Format: [ { "room": "Room Name", "code": "SKU", "qty": 1 } ]
      Note: If the same SKU appears in the same room multiple times, list each with its quantity.` }
    ],
    config: {
      temperature: 0,
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('AI produced no text.');

  let rawItems: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      rawItems = JSON.parse(cleanedText.substring(start, end + 1));
    }
  } catch (e) {
    console.error('[AI Flow] Parse Error:', e);
    return getEmptyResult('Failed to parse AI output.');
  }

  // --- DETERMINISTIC POST-PROCESSING ---
  
  const roomsMap = new Map<string, any>();
  const allowedRooms = ["STD 42 KITCHEN", "OPT GOURMET KITCHEN", "OWNERS BATH", "BATH 2", "BATH 3 UPSTAIRS", "KITCHEN"];
  const ignoredKeywords = ["UPPERS", "TRIM", "HARDWARE", "PERIMETER", "LAUNDRY"];

  let validTotalUnits = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '');
    const roomName = String(item.room || 'General Area').toUpperCase().trim();
    
    // Strict Room Validation
    const isAllowed = allowedRooms.some(r => roomName.includes(r));
    const hasIgnored = ignoredKeywords.some(kw => roomName.includes(kw));
    if (!isAllowed || hasIgnored) return;

    // SKU Validation & Normalization
    if (isExcludedItem(rawCode) || !isValidCabinetSku(rawCode)) return;
    const normCode = normalizeSku(rawCode);

    if (!roomsMap.has(roomName)) {
      roomsMap.set(roomName, {
        room_name: roomName,
        room_type: roomName.includes('BATH') ? 'Bathroom' : 'Kitchen',
        sections: {
          'Wall Cabinets': new Map<string, number>(),
          'Base Cabinets': new Map<string, number>(),
          'Tall Cabinets': new Map<string, number>(),
          'Vanity Cabinets': new Map<string, number>(),
          'Hardware': new Map<string, number>(),
          'Accessories': new Map<string, number>()
        }
      });
    }

    const room = roomsMap.get(roomName);
    const category = mapToCategory(normCode);
    
    // Duplicate Handling: SUM quantities for identical SKUs in same room
    const currentQty = room.sections[category].get(normCode) || 0;
    const newQty = currentQty + (Number(item.qty) || 1);
    room.sections[category].set(normCode, newQty);
  });

  // Convert Maps to Arrays and Calculate Totals
  const finalRooms = Array.from(roomsMap.values()).map(room => {
    const formattedSections: any = {};
    Object.keys(room.sections).forEach(cat => {
      formattedSections[cat] = Array.from(room.sections[cat].entries()).map(([code, qty]) => {
        validTotalUnits += qty;
        return { code, qty, type: cat };
      });
    });
    return { ...room, sections: formattedSections };
  });

  // Validation Audit
  let summary = `Extracted ${validTotalUnits} units across ${finalRooms.length} rooms.`;
  if (validTotalUnits < 47) {
    summary = `Warning: Extraction incomplete (${validTotalUnits}/47). ${summary}`;
  } else if (validTotalUnits > 47) {
    summary = `Notice: Extra units detected (${validTotalUnits}/47). Review for duplicates. ${summary}`;
  }

  return {
    rooms: finalRooms.length > 0 ? finalRooms : getEmptyResult('No valid cabinetry detected.').rooms,
    summary,
    totalUnits: validTotalUnits
  };
}

function mapToCategory(sku: string): string {
  const cat = detectCategory(sku);
  if (cat === 'Hinges & Hardware') return 'Hardware';
  if (['Wall Cabinets', 'Base Cabinets', 'Tall Cabinets', 'Vanity Cabinets', 'Hardware', 'Accessories'].includes(cat)) {
    return cat;
  }
  return 'Accessories';
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return {
    rooms: [{
      room_name: 'Main Area',
      room_type: 'Other',
      sections: {
        'Wall Cabinets': [],
        'Base Cabinets': [],
        'Tall Cabinets': [],
        'Vanity Cabinets': [],
        'Hardware': [],
        'Accessories': []
      }
    }],
    summary: message,
    totalUnits: 0
  };
}
