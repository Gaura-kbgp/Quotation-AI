'use server';
/**
 * @fileOverview High-Precision Extraction Flow (v63.0).
 * Strictly enforces Architectural Room Titles and suppresses sub-sections.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
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
  console.log(`[AI Flow v63] Starting Strict Architectural Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator. 
      
      CRITICAL: Room titles must be extracted ONLY from official PDF header titles.
      
      DO NOT create rooms based on these sub-sections or fragments:
      - ISLAND
      - PERIMETER
      - HARDWARE
      - MASTER BATH (Fragment)
      - KITCHEN (Fragment)
      - BATH 2 (Fragment)
      - BATH 3 (Fragment)
      - LAUNDRY (Fragment)
      - TRIM LIST
      
      ----------------------------
      VALID ROOM TITLES (EXACT LIST)
      ----------------------------
      You must ONLY use these titles for room names:
      1. STANDARD 42" KITCHEN
      2. OPT GOURMET KITCHEN
      3. STANDARD OWNERS BATH
      4. STANDARD BATH 2
      5. STANDARD BATH 3 UPSTAIRS
      6. OPT LAUNDRY (See Rule 4)

      ----------------------------
      DETECTION & MERGING RULES
      ----------------------------
      1. If a page contains one of the VALID TITLES in uppercase at the top, set that as the active room.
      2. If you see items listed under "ISLAND" or "PERIMETER", MERGE them into the parent KITCHEN room.
      3. If a page has no clear title, inherit the room from the previous page.
      4. OVERRIDE RULE: If the Header says "STANDARD BATH 3 UPSTAIRS" but the specific content area contains "OPT LAUNDRY", set the room for those specific items to "OPT LAUNDRY".
      5. Extract EVERY SKU (e.g., W3042, SB36, UF3).
      
      OUTPUT FORMAT:
      Return a JSON array: [ { "room": "VALID ROOM TITLE", "code": "SKU", "qty": 1 } ]` }
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
    'STANDARD BATH 3 UPSTAIRS',
    'OPT LAUNDRY'
  ];

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return;

    // Strict Post-Processing Sanitizer
    let roomName = String(item.room || '').toUpperCase().trim();
    
    // Enforce mapping of sub-sections to parent if the AI missed it
    if (roomName === 'ISLAND' || roomName === 'PERIMETER' || roomName.includes('KITCHEN')) {
        roomName = 'STANDARD 42" KITCHEN'; // Default Kitchen fallback
    } else if (roomName.includes('OWNER') || roomName.includes('MASTER')) {
        roomName = 'STANDARD OWNERS BATH';
    } else if (roomName.includes('BATH 2')) {
        roomName = 'STANDARD BATH 2';
    } else if (roomName.includes('BATH 3')) {
        roomName = 'STANDARD BATH 3 UPSTAIRS';
    } else if (roomName.includes('LAUNDRY')) {
        roomName = 'OPT LAUNDRY';
    }

    // Final check against exact valid list
    if (!VALID_TITLES.includes(roomName)) {
        roomName = 'STANDARD 42" KITCHEN'; // Absolute fallback
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
      if (existing) {
        existing.qty += qty;
      } else {
        room.primaryMap.set(normCode, { code: displayCode, qty });
      }
      totalPrimary += qty;
    } else {
      const existing = room.otherMap.get(normCode);
      if (existing) {
        existing.qty += qty;
      } else {
        room.otherMap.set(normCode, { code: displayCode, qty });
      }
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
    summary: `Takeoff complete: ${totalPrimary} primary units in official rooms.`,
    totalPrimary,
    totalOther
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return {
    rooms: [],
    summary: message,
    totalPrimary: 0,
    totalOther: 0
  };
}
