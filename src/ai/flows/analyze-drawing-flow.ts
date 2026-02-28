'use server';
/**
 * @fileOverview Comprehensive Extraction Flow (v28.0).
 * Implements strict classification and preserves "BUTT" for display while normalising for processing.
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
  console.log(`[AI Flow] Starting Full Classification Analysis for: ${input.projectName}`);

  const response = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator.
      
      TASK:
      Extract EVERY single SKU-like code from the layout drawings.
      
      STEP 1: ROOM ISOLATION
      Extract room titles ONLY from the main blueprint header block (the line between project name and garage info).
      Valid Rooms: STD 42 Kitchen, OPT Gourmet Kitchen, Owners Bath, Bath 2, Bath 3 Upstairs.
      
      STEP 2: EXTRACT SKUs
      - Find every alphanumeric code (e.g. W3024, B15, SB36, FILLER, PANEL).
      - MERGE vertical text (U, F, 3 becomes UF3).
      - PRESERVE "BUTT" as part of the code if present (e.g. W3042 BUTT).
      
      STEP 3: OUTPUT
      Return a JSON array of objects:
      [ { "room": "Room Name", "code": "SKU", "qty": 1 } ]` }
    ],
    config: {
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) return getEmptyResult('No output.');

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

  const roomsMap = new Map<string, any>();
  let totalPrimary = 0;
  let totalOther = 0;

  rawItems.forEach((item) => {
    const rawCode = String(item.code || '');
    const displayCode = cleanSkuForDisplay(rawCode);
    const roomName = String(item.room || 'General Area').toUpperCase().trim();
    const normCode = normalizeSku(rawCode);
    
    if (!normCode) return;

    if (!roomsMap.has(roomName)) {
      roomsMap.set(roomName, {
        room_name: roomName,
        primaryMap: new Map<string, { code: string, qty: number }>(),
        otherMap: new Map<string, { code: string, qty: number }>()
      });
    }

    const room = roomsMap.get(roomName);
    const qty = Number(item.qty) || 1;

    if (isPrimaryCabinet(normCode)) {
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
    summary: `Extracted ${totalPrimary} primary units and ${totalOther} other items.`,
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
