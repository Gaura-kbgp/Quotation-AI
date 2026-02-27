'use server';
/**
 * @fileOverview High-Performance AI Flow for Architectural Cabinet Takeoff.
 * Implements strict room classification and laundry exclusion rules.
 * Uses Gemini 2.0 Flash for multi-page vision analysis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeDrawingInputSchema = z.object({
  pdfDataUri: z.string().describe("PDF data URI containing the full architectural set."),
  projectName: z.string().optional().default("Project"),
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
  console.log(`[AI Flow] Starting Blueprint Analysis for: ${input.projectName}`);

  let attempts = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempts < maxAttempts) {
    try {
      const response = await ai.generate({
        model: 'googleai/gemini-2.0-flash',
        prompt: [
          { media: { url: input.pdfDataUri, contentType: 'application/pdf' } },
          { text: `You are a professional architectural estimator specializing in cabinetry takeoffs.
      
      TASK:
      Analyze the provided PDF. It contains multiple pages (Floor Plans, Cabinet Schedules, Elevations).
      
      CRITICAL ROOM CLASSIFICATION RULES:
      1. ONLY PROCESS these room types:
         - KITCHEN
         - BATH
         - OWNERS BATH
         - BATH 2
         - BATH 3 UPSTAIRS
      
      2. ABSOLUTELY IGNORE (DO NOT EXTRACT ANYTHING FROM THESE):
         - LAUNDRY
         - OPT LAUNDRY
         - TRIM LIST
         - INSTALLATION NOTE
         - HARDWARE (as a room)
         - PERIMETER (as a room)
      
      3. LAUNDRY CONFLICT RULE:
         If a page header mentions a valid room (e.g., "BATH 3 UPSTAIRS") but the page content or sub-headers mention "OPT LAUNDRY" or "LAUNDRY", you MUST IGNORE the entire page. It is a residual header from a template.
      
      4. ROOM TITLE FORMAT:
         Extract the exact full title from the page header.
         Format: ${input.projectName} – <Exact Room Title From Header>
         Example: ${input.projectName} – STANDARD OWNERS BATH
      
      CABINET EXTRACTION RULES:
      - Extract cabinet codes EXACTLY as written (e.g., "W3042 BUTT").
      - Group items by the EXACT FULL ROOM TITLE extracted.
      
      OUTPUT:
      Return ONLY a raw JSON array of objects.
      Format: [ { "room": "Full Room Title", "section": "wall", "code": "W3042 BUTT", "qty": 1 } ]
      
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

      // Filter out ignored rooms just in case the AI missed any
      const ignoredKeywords = ['LAUNDRY', 'TRIM LIST', 'INSTALLATION', 'PERIMETER'];
      const filteredItems = items.filter(item => {
        const r = String(item.room || '').toUpperCase();
        return !ignoredKeywords.some(kw => r.includes(kw));
      });

      const roomsMap = new Map<string, any>();

      filteredItems.forEach((item) => {
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
        const normalizedCode = String(item.code).toUpperCase().trim();
        
        const existing = room.sections[sectionLabel].find((c: any) => c.code === normalizedCode);
        if (existing) {
          existing.qty += (Number(item.qty) || 1);
        } else {
          room.sections[sectionLabel].push({ 
            code: normalizedCode, 
            qty: (Number(item.qty) || 1), 
            type: sectionLabel 
          });
        }
      });

      const roomsList = Array.from(roomsMap.values());

      return {
        rooms: roomsList.length > 0 ? roomsList : [getEmptyResult('No valid rooms detected.').rooms[0]],
        summary: `Extracted ${filteredItems.length} units across ${roomsMap.size} valid areas for ${input.projectName}.`
      };

    } catch (err: any) {
      console.error(`[AI Flow] Attempt ${attempts + 1} failed:`, err.message);
      lastError = err;
      if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        attempts++;
        if (attempts < maxAttempts) {
          const delay = Math.pow(2, attempts) * 1000;
          console.log(`[AI Flow] Rate limit hit. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError || new Error('AI analysis failed after multiple retries.');
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
  return 'Kitchen';
}
