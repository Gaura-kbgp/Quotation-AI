'use server';
/**
 * @fileOverview High-Precision Architectural Blueprint Extraction Flow (v83.0).
 * Specifically optimized for Plan View diagrams and Schedule tables using Gemini 2.5 Pro.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("PROJECT TAKEOFF"),
  pdfText: z.string().optional().describe("Extracted text anchors from title blocks and sheet index."),
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
  console.log(`[Blueprint Hybrid v83] Scanning Plan Views with Gemini 2.5 Pro: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-pro',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a high-speed architectural estimator. Extract ALL cabinetry from these drawings (both Schedules and Plan Views).
      
      ARCHITECTURAL CONTEXT (Sheet Index / Title Blocks):
      {{{pdfText}}}

      PLAN VIEW SCANNING INSTRUCTIONS:
      1. Identify rectangles representing cabinets in the floor plan layouts.
      2. Extract cabinet codes written INSIDE or ADJACENT to these boxes (e.g., "W3042 BUTT", "B30 BUTT", "SB36", "UF342").
      3. Clean codes: Keep full alphanumeric string including suffixes like "BUTT", "L", "R".
      4. Quantity: If multiple identical codes are shown individually, sum them. If a number is in brackets next to a code (e.g. W30(2)), that is the quantity.

      ROOM IDENTIFICATION:
      1. Use the Sheet Title or the Title Block at the bottom/side of the page to find the Room Name.
      2. If "KITCHEN" is in the title block, group items under "KITCHEN".
      3. Common rooms: KITCHEN, OWNERS BATH, BATH 2, BATH 3, LAUNDRY.
      
      Return ONLY a JSON array: [ { "room": "ROOM NAME", "code": "SKU", "qty": number } ]` }
    ],
    config: {
      temperature: 0,
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }]
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('No cabinetry detected in drawing.');

  let rawItems: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      rawItems = JSON.parse(cleanedText.substring(start, end + 1));
    }
  } catch (e) {
    console.error('[Blueprint v83] Parse Error:', e);
    return getEmptyResult('Failed to parse takeoff data.');
  }

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '').trim();
    if (!rawCode) return;

    let roomName = String(item.room || '').toUpperCase().trim();
    if (!roomName) roomName = 'KITCHEN';

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
    summary: `Hybrid Blueprint Scan complete. Extracted ${totalPrimary} cabinets from Plan Views.`,
    totalPrimary,
    totalOther
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return { rooms: [], summary: message, totalPrimary: 0, totalOther: 0 };
}