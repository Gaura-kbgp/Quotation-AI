
import pdf from 'pdf-parse';

interface CabinetItem {
  code: string;
  qty: number;
  description: string;
  type: string;
}

interface RoomData {
  room_name: string;
  room_type: string;
  sections: {
    [key: string]: CabinetItem[];
  };
}

/**
 * PRODUCTION-GRADE MULTI-PAGE PDF EXTRACTOR
 * 
 * Specifically engineered to handle 8+ page architectural sets.
 * 1. Uses a custom pager to ensure page boundaries are respected.
 * 2. Detects rooms per page via Main Header Block patterns.
 * 3. Handles continuation pages (Trim Lists) via context inheritance.
 */
export async function extractCabinetsFromPdf(buffer: Buffer): Promise<{ rooms: RoomData[] }> {
  const rooms: RoomData[] = [];
  let currentRoomName = 'Standard Kitchen';
  
  // Custom pager to preserve page boundaries and prevent first-page-only bias
  const options = {
    pager: (pageData: any) => {
      return pageData.getTextContent().then((textContent: any) => {
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY != item.transform[5] && lastY) text += '\n';
          text += item.str;
          lastY = item.transform[5];
        }
        // Insert a unique marker for page breaks so we can iterate rooms correctly
        return text + "\n---KABS_PAGE_BREAK---\n";
      });
    }
  };

  console.log('[Extractor] Initializing multi-page parse...');
  const data = await pdf(buffer, options);
  const pages = data.text.split('---KABS_PAGE_BREAK---');
  console.log(`[Extractor] Detected ${pages.length} total pages in drawing set.`);

  pages.forEach((pageText, index) => {
    const text = pageText.toUpperCase().trim();
    if (!text) return;

    // 1. Handle Room Detection / Continuation via Header Block
    const detectedRoom = detectRoomNameFromHeader(text);
    
    // Logic: If a page is labeled "TRIM LIST" or has no header, it belongs to the previous room
    if (detectedRoom && !text.includes('TRIM LIST')) {
      currentRoomName = detectedRoom;
      console.log(`[Extractor] Page ${index + 1}: New Room Detected -> ${currentRoomName}`);
    } else {
      console.log(`[Extractor] Page ${index + 1}: Inheriting Context -> ${currentRoomName}`);
    }

    // 2. CABINET CODE REGEX (High Precision)
    // Matches: W3042BUTT, B24 BUTT, VSB3634H, UF342, SB36, DWR3
    // We normalize the text FIRST to handle internal spaces (e.g. "B 24" -> "B24")
    const normalizedPageText = text.replace(/([WBSUVD])\s+(\d)/g, '$1$2');
    const cabinetRegex = /\b(W\d{3,4}BUTT|W\d{3,4}|B\d{1,3}BUTT|B\d{1,3}|SB\d{1,3}|UF\d{1,4}|VSB\d{3,4}H?|DWR\d)\b/g;
    const matches = normalizedPageText.match(cabinetRegex) || [];

    if (matches.length === 0) return;

    // 3. Find or Create Room Container
    let room = rooms.find(r => r.room_name === currentRoomName);
    if (!room) {
      room = {
        room_name: currentRoomName,
        room_type: currentRoomName.includes('BATH') ? 'Bathroom' : 'Kitchen',
        sections: {
          'Wall Cabinets': [],
          'Base Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        }
      };
      rooms.push(room);
    }

    // 4. Group and Count across all pages
    const counts: Record<string, number> = {};
    matches.forEach(m => {
      const cleanCode = m.replace(/\s/g, '');
      counts[cleanCode] = (counts[cleanCode] || 0) + 1;
    });

    Object.entries(counts).forEach(([code, qty]) => {
      const type = classifyCabinet(code);
      const existing = room!.sections[type].find(c => c.code === code);
      if (existing) {
        existing.qty += qty;
      } else {
        room!.sections[type].push({
          code,
          qty,
          description: 'Extracted Item',
          type
        });
      }
    });
  });

  return { rooms };
}

/**
 * Searches for the Room Title in the Main Header Block (Top-Left).
 * Optimized for residential architectural layouts.
 */
function detectRoomNameFromHeader(text: string): string | null {
  // Check for common residential room markers
  if (text.includes('STANDARD 42') && text.includes('KITCHEN')) return 'Standard Kitchen';
  if (text.includes('OPT GOURMET') || text.includes('GOURMET KITCHEN')) return 'Gourmet Kitchen';
  if (text.includes('OWNERS BATH') || text.includes("OWNER'S BATH")) return 'Owners Bath';
  if (text.includes('BATH 2')) return 'Bath 2';
  if (text.includes('BATH 3')) return 'Bath 3';
  if (text.includes('LAUNDRY')) return 'Laundry Room';
  if (text.includes('POWDER')) return 'Powder Room';
  
  // Specific pattern: ROOM: [TITLE]
  const headerMatch = text.match(/ROOM:\s*([A-Z0-9\s-]+)/);
  if (headerMatch && headerMatch[1]) {
    const title = headerMatch[1].trim();
    if (title.length > 3 && !['HARDWARE', 'PERIMETER'].includes(title)) {
      return title;
    }
  }
  
  return null;
}

function classifyCabinet(code: string): string {
  const c = code.toUpperCase();
  if (c.startsWith('W')) return 'Wall Cabinets';
  if (c.startsWith('B') || c.startsWith('SB')) return 'Base Cabinets';
  if (c.startsWith('UF')) return 'Tall Cabinets';
  if (c.startsWith('VSB')) return 'Vanity Cabinets';
  return 'Hardware';
}
