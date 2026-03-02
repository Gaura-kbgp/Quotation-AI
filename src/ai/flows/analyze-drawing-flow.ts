'use server';
/**
 * @fileOverview Strict 5-Room Architectural Extraction Flow (v77.0).
 * Uses Gemini 2.5 Pro for flagship architectural precision.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  photoDataUri: z.string().optional().describe("Legacy field for image data."),
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("4031 MAGNOLIA"),
});
export type AnalyzeDrawingInput = z.infer<typeof AnalyzeDrawingInputSchema>;

const AnalyzeDrawingOutputSchema = z.object({
  rooms: z.array(z.object({
    room_name: z.string(),
    primaryCabinets: z.array(z.object({ code: z.string(), qty: z.number() })),
    otherItems: z.array(z.object({ code: z.string(), qty: z.number() })),
  })),
  summary: z.string(),
  totalPrimary: z.number(),
  totalOther: z.number(),
});

export type AnalyzeDrawingOutput = z.infer<typeof AnalyzeDrawingOutputSchema>;

export async function analyzeDrawing(input: AnalyzeDrawingInput): Promise<AnalyzeDrawingOutput> {
  console.log(`[AI Flow v77] Starting High-Precision Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-pro',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator specializing in cabinetry takeoffs. 
      
      CRITICAL: You must ONLY extract data into these 5 EXACT rooms. 
      
      ----------------------------
      OFFICIAL ROOM TITLES (STRICT)
      ----------------------------
      1. STANDARD 42" KITCHEN
      2. OPT GOURMET KITCHEN
      3. STANDARD OWNERS BATH
      4. STANDARD BATH 2
      5. STANDARD BATH 3 UPSTAIRS

      ----------------------------
      CONSOLIDATION RULES
      ----------------------------
      1. IGNORE labels like "OPT LAUNDRY", "ISLAND", "PERIMETER", "HARDWARE", or "TRIM LIST" as top-level room titles.
      2. Page 8 (OPT LAUNDRY) items MUST be merged into "STANDARD BATH 3 UPSTAIRS".
      3. Items under "ISLAND" or "PERIMETER" MUST be merged into the active KITCHEN room.
      4. Any item found in the drawing MUST be assigned to one of the 5 official rooms above.
      
      OUTPUT FORMAT:
      Return a JSON array of objects: [ { "room": "OFFICIAL ROOM TITLE", "code": "SKU", "qty": 1 } ]` }
    ],
    config: {
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('No output from AI.');

  let rawItems: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      rawItems = JSON.parse(cleanedText.substring(start, end + 1));
    }
  } catch (e) {
    console.error('[AI Flow] JSON Parse Error:', e);
    return getEmptyResult('Failed to parse AI takeoff.');
  }

  const VALID_TITLES = [
    'STANDARD 42" KITCHEN',
    'OPT GOURMET KITCHEN',
    'STANDARD OWNERS BATH',
    'STANDARD BATH 2',
    'STANDARD BATH 3 UPSTAIRS'
  ];

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return;

    let roomName = String(item.room || '').toUpperCase().trim();
    
    // Strict Mapper: Force sub-sections into their parent rooms
    if (roomName.includes('KITCHEN') || roomName === 'ISLAND' || roomName === 'PERIMETER') {
        roomName = roomName.includes('GOURMET') ? 'OPT GOURMET KITCHEN' : 'STANDARD 42" KITCHEN';
    } else if (roomName.includes('OWNER') || roomName.includes('MASTER') || roomName.includes('OWNERS')) {
        roomName = 'STANDARD OWNERS BATH';
    } else if (roomName.includes('BATH 2')) {
        roomName = 'STANDARD BATH 2';
    } else if (roomName.includes('BATH 3') || roomName.includes('LAUNDRY')) {
        roomName = 'STANDARD BATH 3 UPSTAIRS';
    }

    if (!VALID_TITLES.includes(roomName)) {
        roomName = 'STANDARD 42" KITCHEN';
    }

    const displayCode = cleanSkuForDisplay(rawCode);
    const normCode = normalizeSku(rawCode);
    
    if (!roomsMap.has(roomName)) {
      roomsMap.set(roomName, {
        room_name: roomName,
        primaryMap: new Map<string, { code: string, qty: number }>(),
        otherMap: new Map<string, { code: string, qty: number }>()
      });
    }

    const room = roomsMap.get(roomName);
    const qty = Number(item.qty) || 1;

    if (isPrimaryCabinet(rawCode)) {
      const existing = room.primaryMap.get(normCode);
      if (existing) existing.qty += qty;
      else room.primaryMap.set(normCode, { code: displayCode, qty });
      totalPrimary += qty;
    } else {
      const existing = room.otherMap.get(normCode);
      if (existing) existing.qty += qty;
      else room.otherMap.set(normCode, { code: displayCode, qty });
      totalOther += qty;
    }
  });

  const finalRooms = Array.from(roomsMap.values()).map(r => ({
    room_name: r.room_name,
    primaryCabinets: Array.from(r.primaryMap.values()),
    otherItems: Array.from(r.otherMap.values())
  }));

  return {
    rooms: finalRooms,
    summary: `Takeoff complete using Gemini 2.5 Pro.`,
    totalPrimary,
    totalOther
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return { rooms: [], summary: message, totalPrimary: 0, totalOther: 0 };
}
