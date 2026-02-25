
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
 * Uses a custom pager to ensure page boundaries are respected.
 * Detects rooms per page and handles continuation pages (Trim Lists).
 */
export async function extractCabinetsFromPdf(buffer: Buffer): Promise<{ rooms: RoomData[] }> {
  const rooms: RoomData[] = [];
  let currentRoomName = 'Standard Kitchen';
  
  // Custom pager to preserve page boundaries
  const options = {
    pager: (pageData: any) => {
      return pageData.getTextContent().then((textContent: any) => {
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY != item.transform[5] && lastY) text += '\n';
          text += item.str;
          lastY = item.transform[5];
        }
        // Insert a unique marker for page breaks
        return text + "\n---KABS_PAGE_BREAK---\n";
      });
    }
  };

  const data = await pdf(buffer, options);
  const pages = data.text.split('---KABS_PAGE_BREAK---');

  pages.forEach((pageText) => {
    const text = pageText.toUpperCase().trim();
    if (!text) return;

    // 1. Handle Room Detection / Continuation
    const detectedRoom = detectRoomName(text);
    
    // Rule: "Trim List" or missing title inherits previous room
    if (detectedRoom && !text.includes('TRIM LIST')) {
      currentRoomName = detectedRoom;
    }

    // 2. Cabinet Code Extraction (Regex)
    // Pattern: W\d, B\d, SB\d, UF\d, VSB\d, DWR\d
    const cabinetRegex = /\b(W\d{3,4}BUTT|W\d{3,4}|B\d{1,3}BUTT|B\d{1,3}|SB\d{1,3}|UF\d{1,4}|VSB\d{3,4}H?|DWR\d)\b/g;
    
    // Normalize text by removing spaces within potential codes (e.g. B 24 -> B24)
    // We do this carefully to not break the regex boundaries
    const normalizedText = text.replace(/([WBSUVD])\s+(\d)/g, '$1$2');
    const matches = normalizedText.match(cabinetRegex) || [];

    if (matches.length === 0) return;

    // 3. Find or Create Room
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

    // 4. Group and Count
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

function detectRoomName(text: string): string | null {
  if (text.includes('STANDARD 42') && text.includes('KITCHEN')) return 'Standard Kitchen';
  if (text.includes('OPT GOURMET')) return 'Gourmet Kitchen';
  if (text.includes('OWNERS BATH')) return 'Owners Bath';
  if (text.includes('BATH 2')) return 'Bath 2';
  if (text.includes('BATH 3')) return 'Bath 3';
  if (text.includes('LAUNDRY')) return 'Laundry Room';
  if (text.includes('POWDER')) return 'Powder Room';
  
  // Check for specific header pattern (Project/Room)
  const headerMatch = text.match(/ROOM:\s*([A-Z0-9\s]+)/);
  if (headerMatch) return headerMatch[1].trim();
  
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
