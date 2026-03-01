'use server';
/**
 * @fileOverview High-Precision Extraction Flow (v62.0).
 * Improved instructions for Room Consolidation and Accessory classification.
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
  console.log(`[AI Flow v62] Starting High-Precision Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator specialized in high-end cabinetry takeoffs.
      
      GOAL:
      Extract EVERY single SKU-like code from the drawings.
      
      STRICT ROOM GROUPING RULES:
      - Identify primary rooms like "Kitchen", "Master Bath", "Laundry Room".
      - CRITICAL: Do NOT create separate rooms for optional sub-sections or labels like "OPT LAUNDRY", "WASH/DRY", or "ACCESSORIES". 
      - If you see "OPT LAUNDRY" or similar labels, MERGE these items into the primary Room they belong to (usually the Kitchen or the main room on that page).
      - Treat "Hardware" or "Laundry" as a component list within a room, not as a new room.
      
      STRICT SKU RULES:
      - Extract EXACT codes (e.g. W3042, SB36, UF3, UF342, RR120FL).
      - Look for Fillers (UF), oven Cabinets (OVD), and molding (RR).
      - MERGE multi-line vertical text (e.g. "U" over "F" over "3" becomes "UF3").
      - PRESERVE "BUTT" as part of the code if it appears next to a SKU.
      
      OUTPUT:
      Return a JSON array: [ { "room": "Parent Room Name", "code": "SKU", "qty": 1 } ]` }
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

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return;

    // Post-processing: Consolidated Room Naming
    let roomName = String(item.room || 'General Area').toUpperCase().trim();
    if (roomName.includes("OPT LAUNDRY") || roomName.includes("LAUNDRY") && !roomName.includes("ROOM")) {
       // Heuristic: If it's a sub-title like OPT LAUNDRY, group it with the main Kitchen if possible
       // For this tool, we will simplify to the core area name
       roomName = roomName.replace("OPT ", "").split(" ")[0]; 
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
    summary: `Takeoff complete: ${totalPrimary} primary units, ${totalOther} accessories.`,
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
