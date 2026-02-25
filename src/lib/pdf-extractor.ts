
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

  console.log('[Extractor] Initializing deep multi-page parse...');
  const data = await pdf(buffer, options);
  
  // Ensure we get all text even if the pager was skipped by the library for some reason
  const fullText = data.text;
  const pages = fullText.split('---KABS_PAGE_BREAK---').map(p => p.trim()).filter(Boolean);
  
  console.log(`[Extractor] Total pages detected: ${pages.length}`);

  pages.forEach((pageText, index) => {
    const text = pageText.toUpperCase();
    
    // 1. Detect Room Name with higher sensitivity
    const detectedRoom = detectRoomNameFromHeader(text);
    
    if (detectedRoom) {
      currentRoomName = detectedRoom;
      console.log(`[Extractor] Page ${index + 1}: Found Room -> ${currentRoomName}`);
    }

    // 2. High-Precision Cabinet Code Regex
    // Now captures: W3042, W-3042, B24, B-24, VSB3634H, UF342, SB36, DWR3, etc.
    // Handles internal spaces by normalizing text locally for regex match
    const normalizedPageText = text.replace(/([WBSUVD])\s*[- ]?\s*(\d)/g, '$1$2');
    const cabinetRegex = /\b([WBSUVD]\d{1,5}(?:BUTT|H)?|SB\d{1,3}|DWR\d)\b/g;
    const matches = normalizedPageText.match(cabinetRegex) || [];

    if (matches.length === 0) return;

    // 3. Find or Create Room Container
    let room = rooms.find(r => r.room_name === currentRoomName);
    if (!room) {
      room = {
        room_name: currentRoomName,
        room_type: classifyRoomType(currentRoomName),
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

  // Final cleanup: Remove empty rooms if any
  return { rooms: rooms.filter(r => Object.values(r.sections).some(s => s.length > 0)) };
}

function detectRoomNameFromHeader(text: string): string | null {
  const commonRooms = [
    'STANDARD 42 KITCHEN',
    'GOURMET KITCHEN',
    'OWNERS BATH',
    'OWNER\'S BATH',
    'BATH 1', 'BATH 2', 'BATH 3', 'BATH 4',
    'POWDER ROOM',
    'LAUNDRY ROOM',
    'GARAGE',
    'PANTRY'
  ];

  for (const room of commonRooms) {
    if (text.includes(room)) return room;
  }

  // Handle "ROOM: [NAME]" pattern
  const roomMatch = text.match(/ROOM:\s*([A-Z0-9\s-]+)/);
  if (roomMatch && roomMatch[1]) {
    const title = roomMatch[1].trim();
    if (title.length > 2 && !['HARDWARE', 'PERIMETER'].includes(title)) {
      return title;
    }
  }

  // Handle Builder Layout Patterns
  const layoutMatch = text.match(/([A-Z0-9\s]+)\s+LAYOUT/);
  if (layoutMatch && layoutMatch[1]) {
    const title = layoutMatch[1].trim();
    if (title.length > 3 && title.length < 30) return title;
  }
  
  return null;
}

function classifyRoomType(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('BATH') || n.includes('POWDER')) return 'Bathroom';
  if (n.includes('LAUNDRY')) return 'Laundry';
  return 'Kitchen';
}

function classifyCabinet(code: string): string {
  const c = code.toUpperCase();
  if (c.startsWith('W')) return 'Wall Cabinets';
  if (c.startsWith('B') || c.startsWith('SB')) return 'Base Cabinets';
  if (c.startsWith('UF') || c.startsWith('T')) return 'Tall Cabinets';
  if (c.startsWith('VSB')) return 'Vanity Cabinets';
  return 'Hardware';
}
