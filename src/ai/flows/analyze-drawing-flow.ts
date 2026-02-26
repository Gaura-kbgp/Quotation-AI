
'use server';
/**
 * @fileOverview High-Performance AI Flow for Architectural Cabinet Takeoff.
 * Uses Gemini 2.5 Flash for high-precision multi-page vision analysis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
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
  console.log('[AI Flow] Starting Gemini 2.5 Flash Multi-Page Vision Analysis...');

  // Using direct generation to bypass nested schema limits and improve timeout resilience
  const response = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator specializing in cabinetry takeoffs. 
  
  TASK:
  Analyze the provided PDF. It contains multiple pages (Floor Plans, Cabinet Schedules, Elevations).
  Iterate through EVERY page.
  
  EXTRACT:
  - All cabinet codes (e.g., W3042, B24, SB36, UF2490, VSB3634H).
  - Include items from Schedules, Floor Plans, and Detail/Interior Elevations.
  - Group items by the ROOM identified on the drawing (e.g., "Standard Kitchen", "Master Bath").
  
  IGNORE:
  - Electrical fixtures (switches, lights).
  - HVAC/Plumbing markers.
  - Appliance model numbers.
  
  OUTPUT:
  Return ONLY a raw JSON array of objects. 
  Example: [ { "room": "Kitchen", "section": "wall", "code": "W3042", "qty": 1 } ]
  
  Valid sections: wall, base, tall, vanity, hardware.` }
    ],
    config: {
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
      ],
    },
  });

  const text = response.text;
  
  if (!text || text.trim() === '') {
    return getEmptyResult('AI analysis produced no results.');
  }

  let items: any[] = [];
  try {
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBracket = cleanedText.indexOf('[');
    const lastBracket = cleanedText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      items = JSON.parse(cleanedText.substring(firstBracket, lastBracket + 1));
    } else {
      items = JSON.parse(cleanedText);
    }
  } catch (e) {
    console.error('[AI Parser] JSON Parse Error:', e);
    return getEmptyResult('Failed to parse AI response structure.');
  }

  const roomsMap = new Map<string, any>();

  items.forEach((item) => {
    const roomKey = item.room || 'Project Area';
    
    if (!roomsMap.has(roomKey)) {
      roomsMap.set(roomKey, {
        room_name: roomKey,
        room_type: classifyRoomType(roomKey),
        sections: {
          'Wall Cabinets': [],
          'Base Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        }
      });
    }

    const room = roomsMap.get(roomKey);
    const sectionLabel = mapSectionToLabel(item.section);
    
    const existing = room.sections[sectionLabel].find((c: any) => c.code === item.code);
    if (existing) {
      existing.qty += (Number(item.qty) || 1);
    } else {
      room.sections[sectionLabel].push({ 
        code: String(item.code).toUpperCase().trim(), 
        qty: (Number(item.qty) || 1), 
        type: sectionLabel 
      });
    }
  });

  const roomsList = Array.from(roomsMap.values());

  return {
    rooms: roomsList.length > 0 ? roomsList : [getEmptyResult('No cabinets detected.').rooms[0]],
    summary: `Extracted ${items.length} units across ${roomsMap.size} project areas using Gemini 2.5 Flash.`
  };
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

function mapSectionToLabel(section: string): string {
  const s = String(section || '').toLowerCase();
  if (s.includes('wall')) return 'Wall Cabinets';
  if (s.includes('base')) return 'Base Cabinets';
  if (s.includes('tall')) return 'Tall Cabinets';
  if (s.includes('vanity')) return 'Vanity Cabinets';
  return 'Hardware';
}

function classifyRoomType(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('BATH') || n.includes('POWDER')) return 'Bathroom';
  if (n.includes('LAUNDRY')) return 'Laundry';
  if (n.includes('MUD')) return 'Mudroom';
  return 'Kitchen';
}
