
'use server';
/**
 * @fileOverview Production-Grade AI Flow for Architectural Cabinet Takeoff.
 * Optimized for Gemini 2.5 Flash to handle multi-page PDFs with visual reasoning.
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
  console.log('[AI Flow] Starting Multi-Page PDF Vision Analysis with Gemini 2.5 Flash...');

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    prompt: [
      { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
      { text: `You are a professional architectural estimator specializing in cabinet takeoff. 
  
  TASK:
  Analyze the provided PDF drawing. This is a MULTI-PAGE document.
  You MUST process EVERY SINGLE PAGE provided.
  
  PROCESS:
  1. Iterate through EVERY page of the PDF.
  2. IDENTIFY: Identify all cabinet codes (SKUs) in Floor Plans, Interior Elevations, and Cabinet Schedules.
  3. CLASSIFY: Assign a section to each code:
     - Starts with W -> wall
     - Starts with B or SB -> base
     - Starts with UF -> tall
     - Starts with VSB -> vanity
     - Fillers/Moldings/Trim -> hardware
  4. IGNORE: Do NOT extract electrical, lighting, HVAC, or plumbing fixtures.
  5. OUTPUT: Return a raw JSON array of objects.
  
  Format:
  [
    { "page": 1, "room": "Standard Kitchen", "section": "wall", "code": "W3042", "qty": 1 },
    ...
  ]

  Rules for extraction:
  - Normalize codes: "B 24" -> "B24".
  - Detect specific rooms: "Standard Kitchen", "Owners Bath", "Laundry", "Mudroom", etc.
  
  IMPORTANT: Return ONLY the raw JSON array. No markdown, no backticks.` }
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
    console.warn('[AI Flow] Model returned empty response.');
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
    return getEmptyResult('The AI returned data in an unexpected format.');
  }

  const roomsMap = new Map<string, any>();

  items.forEach((item) => {
    const roomKey = item.room || 'Other';
    
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
    const sectionKey = mapSectionToLabel(item.section);
    
    const existing = room.sections[sectionKey].find((c: any) => c.code === item.code);
    if (existing) {
      existing.qty += (item.qty || 1);
    } else {
      room.sections[sectionKey].push({ 
        code: item.code, 
        qty: (item.qty || 1), 
        type: sectionKey 
      });
    }
  });

  const roomsList = Array.from(roomsMap.values());

  if (roomsList.length === 0) {
    return getEmptyResult('No cabinets detected.');
  }

  return {
    rooms: roomsList,
    summary: `Processed full document. Extracted ${items.length} line items across ${roomsMap.size} rooms.`
  };
}

function getEmptyResult(message: string): AnalyzeDrawingOutput {
  return {
    rooms: [{
      room_name: 'Main Room',
      room_type: 'Kitchen',
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
  const s = String(section).toLowerCase();
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
