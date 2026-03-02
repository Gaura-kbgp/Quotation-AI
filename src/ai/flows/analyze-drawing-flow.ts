'use server';
/**
 * @fileOverview NKBA-Aligned Architectural Extraction Flow (v85.0).
 * Specifically tuned to fetch Wall, Tall, Vanity, Fillers, and Hardware using Gemini 2.5 Pro.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the architectural set."),
  projectName: z.string().optional().default("PROJECT TAKEOFF"),
  pdfText: z.string().optional().describe("Local text scan for sheet index and room anchors."),
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
  console.log(`[Blueprint v85] NKBA-Aligned Scan starting for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-pro',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are an expert architectural estimator. Extract cabinetry from Plans and Schedules based on NKBA rules.
      
      ARCHITECTURAL ROADMAP (Local Text Scan):
      {{{pdfText}}}

      TARGET CATEGORIES (Identify these specific codes):
      1. Wall Cabinets (W...)
      2. Tall Cabinets (T, P, O, REF, UTIL...)
      3. Vanity Cabinets (V, VSB...)
      4. Universal Fillers (UF, F...)
      5. Hardwares (HW, KNOB, PULL...)
      6. Base Cabinets (B, SB...)

      INSTRUCTIONS:
      - Use the Roadmap to find Cabinetry Schedules and Floor Plans.
      - Extract Room Names from Title Blocks (KITCHEN, BATH, LAUNDRY).
      - Group items by Room.
      - Capture full SKU codes including suffixes (e.g. W3042 BUTT).
      
      Return ONLY a flat JSON array: [ { "room": "ROOM NAME", "code": "SKU", "qty": number } ]` }
    ],
    config: {
      temperature: 0,
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }]
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('No cabinetry detected.');

  let rawItems: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      rawItems = JSON.parse(cleanedText.substring(start, end + 1));
    }
  } catch (e) {
    console.error('[Blueprint v85] Parse Error:', e);
    return getEmptyResult('Extraction parse failed.');
  }

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return;

    let roomName = String(item.room || '').toUpperCase().trim() || 'KITCHEN';
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

  return {
    rooms: Array.from(roomsMap.values()).map(r => ({
      room_name: r.room_name,
      primaryCabinets: Array.from(r.primaryMap.values()),
      otherItems: Array.from(r.otherMap.values())
    })),
    summary: `Takeoff complete. ${totalPrimary} boxes identified.`,
    totalPrimary,
    totalOther
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return { rooms: [], summary: message, totalPrimary: 0, totalOther: 0 };
}
