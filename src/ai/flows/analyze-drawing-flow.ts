'use server';
/**
 * @fileOverview NKBA-Aligned Hybrid Architectural Extraction Flow (v86.0).
 * Specifically tuned to fetch Wall, Tall, Vanity, Fillers, and Hardware using Gemini 2.5 Pro.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeSku, isPrimaryCabinet, cleanSkuForDisplay } from '@/lib/utils';
import Replicate from 'replicate';

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
  console.log(`[Blueprint v86] High-Speed Scan starting with Gemini 3.1 Flash Lite for: ${input.projectName}`);

  let text = '';

  try {
    const response = await ai.generate({
      model: 'googleai/gemini-3.1-flash-lite-preview',
      prompt: [
        { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
        {
          text: `You are an expert architectural estimator. Extract cabinetry from Plans and Schedules based on NKBA rules.
        
        ARCHITECTURAL ROADMAP (Local Text Anchors):
        ${input.pdfText || 'None provided'}

        TARGET CATEGORIES (Identify these specific codes):
        1. Wall Cabinets (W...)
        2. Tall Cabinets (T, P, O, REF, UTIL...)
        3. Vanity Cabinets (V, VSB...)
        4. Universal Fillers (UF, F...)
        5. Hardwares (HW, KNOB, PULL...)
        6. Base Cabinets (B, SB...)

        INSTRUCTIONS:
        - Scan Floor Plans and Schedules.
        - Extract Room Names from Title Blocks (KITCHEN, BATH, LAUNDRY).
        - Group items by Room.
        - Capture full SKU codes including suffixes (e.g. W3042 BUTT).
        - BE FAST: Focus on the schedules and floor plans only.
        
        Return ONLY a flat JSON array: [ { "room": "ROOM NAME", "code": "SKU", "qty": number } ]` }
      ],
      config: {
        temperature: 0,
        safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }]
      },
    });
    text = response.text;
  } catch (geminiError) {
    console.error('[Blueprint v86] Gemini failed, falling back to Replicate:', geminiError);

    try {
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      });

      // Using LLaVA for fallback as it handles vision prompts well
      const output: any = await replicate.run(
        "yorickvp/llava-13b:e27306d716412a970225102a9cf297dae08764b85c2c77f0a8c232c918342718",
        {
          input: {
            image: input.pdfDataUri,
            prompt: `Extract cabinetry codes from this architectural drawing. 
            Identify Room Names and SKU codes (like W3042, B36, VSB30). 
            Return ONLY a JSON array: [{"room": "ROOM", "code": "SKU", "qty": number}]`
          }
        }
      );
      text = Array.isArray(output) ? output.join('') : String(output);
    } catch (replicateError) {
      console.error('[Blueprint v86] Replicate fallback also failed:', replicateError);
      return getEmptyResult('AI analysis engines exhausted.');
    }
  }

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
    console.error('[Blueprint v86] Parse Error:', e);
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
