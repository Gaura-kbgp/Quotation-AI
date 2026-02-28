'use server';
/**
 * @fileOverview High-Performance AI Flow for Deterministic Architectural Cabinet Takeoff.
 * Implements strict pattern matching, keyword exclusions, and room-wise aggregation.
 * Uses Gemini 2.0 Flash for multi-page vision analysis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isValidCabinetSku, isExcludedItem, detectCategory } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("Project"),
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
    }),
  })),
  summary: z.string(),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: AnalyzeDrawingInput): Promise<AnalyzeDrawingOutput> {
  console.log(`[AI Flow] Starting Deterministic Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator. 
      
      TASK:
      Extract EVERY cabinet SKU from the drawings.
      
      STEP 1: ROOM ISOLATION
      Parse document SECTION-BY-SECTION. Do NOT scan globally.
      Identify valid rooms: KITCHEN, BATH, OWNERS BATH, BATH 2, POWDER.
      
      STEP 2: SKU EXTRACTION RULES
      Only extract items matching these patterns:
      - Wall: W followed by numbers (e.g. W3024)
      - Base: B or SB followed by numbers (e.g. B30, SB36)
      - Vanity: V, VSB, or VS followed by numbers (e.g. V30, VSB36)
      - Tall: TP, PANTRY, OVEN, or OVD followed by numbers
      - Accessories: RR, UF
      
      STEP 3: EXCLUSIONS
      IGNORE any line containing: HOOD, RANGE, MICRO, FRIDGE, DISH, SINK, LIGHT, ELECTRICAL, PRICING, MARCH, SHEET.
      
      STEP 4: OUTPUT FORMAT
      Return ONLY a raw JSON array of objects.
      Format: [ { "room": "Room Name", "code": "SKU", "qty": 1 } ]` }
    ],
    config: {
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

  // --- DETERMINISTIC POST-PROCESSING (Steps 4, 5, 6) ---
  
  const roomsMap = new Map<string, any>();
  let totalScanned = rawItems.length;
  let validCount = 0;
  let excludedCount = 0;
  let duplicatesMerged = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '');
    const roomName = String(item.room || 'General Area').toUpperCase().trim();
    
    // Step 3 & 4: Exclude and Normalize
    if (isExcludedItem(rawCode) || !isValidCabinetSku(rawCode)) {
      excludedCount++;
      return;
    }

    const normCode = normalizeSku(rawCode);
    validCount++;

    if (!roomsMap.has(roomName)) {
      roomsMap.set(roomName, {
        room_name: roomName,
        room_type: roomName.includes('BATH') || roomName.includes('POWDER') ? 'Bathroom' : 'Kitchen',
        sections: {
          'Wall Cabinets': new Map<string, number>(),
          'Base Cabinets': new Map<string, number>(),
          'Tall Cabinets': new Map<string, number>(),
          'Vanity Cabinets': new Map<string, number>(),
          'Hardware': new Map<string, number>()
        }
      });
    }

    const room = roomsMap.get(roomName);
    const category = mapToCategory(normCode);
    
    // Step 5: Duplicate Handling (Sum quantities)
    const currentQty = room.sections[category].get(normCode) || 0;
    const newQty = currentQty + (Number(item.qty) || 1);
    if (currentQty > 0) duplicatesMerged++;
    room.sections[category].set(normCode, newQty);
  });

  // Step 6: Final Aggregation (Convert Maps back to Arrays)
  const finalRooms = Array.from(roomsMap.values()).map(room => {
    const formattedSections: any = {};
    Object.keys(room.sections).forEach(cat => {
      formattedSections[cat] = Array.from(room.sections[cat].entries()).map(([code, qty]) => ({
        code,
        qty,
        type: cat
      }));
    });
    return { ...room, sections: formattedSections };
  });

  // Step 8: Debug Logging
  console.log(`[Takeoff Audit] 
    - Lines Scanned: ${totalScanned}
    - Valid Cabinets: ${validCount}
    - Non-Cabinetry Excluded: ${excludedCount}
    - Duplicates Merged: ${duplicatesMerged}
    - Final Unique SKUs: ${validCount - duplicatesMerged}
  `);

  // Step 7: Validation
  const kitchen = finalRooms.find(r => r.room_type === 'Kitchen');
  let summaryPrefix = "";
  if (kitchen && validCount < 10) {
    summaryPrefix = "Warning: Extraction incomplete (< 10 units). ";
  }

  return {
    rooms: finalRooms.length > 0 ? finalRooms : getEmptyResult('No valid cabinetry detected.').rooms,
    summary: `${summaryPrefix}Successfully extracted ${validCount} units across ${finalRooms.length} rooms.`
  };
}

function mapToCategory(sku: string): string {
  const cat = detectCategory(sku);
  if (cat === 'Hinges & Hardware') return 'Hardware';
  return cat;
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
        'Hardware': []
      }
    }],
    summary: message
  };
}
