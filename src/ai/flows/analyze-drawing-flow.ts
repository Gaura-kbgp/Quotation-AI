'use server';
/**
 * @fileOverview High-Efficiency Architectural Extraction Flow (v82.0).
 * Uses Gemini 2.5 Pro with optimized prompt heuristics for faster processing.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("PROJECT TAKEOFF"),
  pdfText: z.string().optional().describe("Extracted text anchors from the PDF to help room identification."),
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
  console.log(`[AI Hybrid v82] Optimized Logic Fusion with Gemini 2.5 Pro: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-pro',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a high-speed architectural estimator. Extract ALL cabinetry from these drawings.
      
      ARCHITECTURAL CONTEXT (Text Layer):
      {{{pdfText}}}

      CRITICAL INSTRUCTIONS:
      1. Use Page Titles and the Sheet Index from the context to find Cabinetry Schedules and Floor Plans.
      2. Group items into these official rooms: KITCHEN, OWNERS BATH, BATH 2, BATH 3, LAUNDRY.
      3. Extract EXACT SKU (Code) and Quantity (Qty).
      4. If a code looks like a cabinet (e.g., W3630, B24, SB36), it is a Primary Cabinet.
      5. If it looks like a filler or molding (e.g., UF3, RR, CM), it is an Other Item.
      
      Return ONLY a JSON array: [ { "room": "ROOM NAME", "code": "SKU", "qty": number } ]` }
    ],
    config: {
      temperature: 0,
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }]
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('No data extracted.');

  let rawItems: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      rawItems = JSON.parse(cleanedText.substring(start, end + 1));
    }
  } catch (e) {
    console.error('[AI Hybrid v82] Extraction Parse Error:', e);
    return getEmptyResult('Failed to parse AI takeoff data.');
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
    summary: `Optimized hybrid takeoff complete. Found ${totalPrimary} cabinets across ${finalRooms.length} rooms.`,
    totalPrimary,
    totalOther
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return { rooms: [], summary: message, totalPrimary: 0, totalOther: 0 };
}
