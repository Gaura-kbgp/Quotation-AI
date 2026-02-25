
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
 * PRODUCTION-GRADE PDF EXTRACTOR
 * Scans multi-page drawings, detects rooms, and groups cabinets via Regex.
 */
export async function extractCabinetsFromPdf(buffer: Buffer): Promise<{ rooms: RoomData[] }> {
  const rooms: RoomData[] = [];
  
  // Custom pager handler for pdf-parse (though it doesn't support individual page triggers well by default)
  // We'll use a delimiter trick or a custom options object if the library supports it.
  // Actually, standard pdf-parse merges. We'll split the result if markers are found.
  
  const options = {
    // pdf-parse options
  };

  const data = await pdf(buffer, options);
  const pages = data.text.split(/\f/); // Split by form feed (common PDF page separator)

  pages.forEach((pageText, idx) => {
    const text = pageText.toUpperCase().replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    // 1. Room Detection
    let roomName = detectRoomName(text);
    if (!roomName) {
      // If no room detected and we have pages, we might skip cover/notes
      if (idx === 0 && !text.includes('CABINET')) return;
      roomName = rooms.length > 0 ? rooms[rooms.length - 1].room_name : 'Standard Kitchen';
    }

    // 2. Cabinet Code Extraction
    // Pattern: W3042BUTT, W3042, B24BUTT, B24, SB36, UF342, VSB3634H, DWR3
    const cabinetRegex = /\b(W\d{3,4}BUTT|W\d{3,4}|B\d{1,3}BUTT|B\d{1,3}|SB\d{1,3}|UF\d{1,4}|VSB\d{3,4}H?|DWR\d)\b/g;
    const matches = text.match(cabinetRegex) || [];

    if (matches.length === 0) return;

    // 3. Counting & Grouping
    let currentRoom = rooms.find(r => r.room_name === roomName);
    if (!currentRoom) {
      currentRoom = {
        room_name: roomName,
        room_type: roomName.includes('BATH') ? 'Bathroom' : 'Kitchen',
        sections: {
          'Wall Cabinets': [],
          'Base Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        }
      };
      rooms.push(currentRoom);
    }

    const counts: Record<string, number> = {};
    matches.forEach(m => {
      const normalized = m.replace(/\s/g, '');
      counts[normalized] = (counts[normalized] || 0) + 1;
    });

    Object.entries(counts).forEach(([code, qty]) => {
      const type = classifyCabinet(code);
      const existing = currentRoom!.sections[type].find(c => c.code === code);
      if (existing) {
        existing.qty += qty;
      } else {
        currentRoom!.sections[type].push({
          code,
          qty,
          description: 'Extracted Cabinet',
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
  return null;
}

function classifyCabinet(code: string): string {
  if (code.startsWith('W')) return 'Wall Cabinets';
  if (code.startsWith('B') || code.startsWith('SB')) return 'Base Cabinets';
  if (code.startsWith('UF')) return 'Tall Cabinets';
  if (code.startsWith('VSB')) return 'Vanity Cabinets';
  return 'Hardware';
}
