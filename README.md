
# KABS Quotation AI

This is a NextJS starter in Firebase Studio, optimized for high-performance architectural cabinetry takeoffs.

## Supabase Database Setup

To resolve "Table not found" or "Column not found" errors, run the following SQL in your Supabase SQL Editor:

```sql
-- 1. Manufacturers Table
CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Manufacturer Files
CREATE TABLE IF NOT EXISTS manufacturer_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE CASCADE,
  file_type TEXT,
  file_name TEXT,
  file_url TEXT,
  file_format TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Manufacturer Pricing (SINGLE SOURCE OF TRUTH)
CREATE TABLE IF NOT EXISTS manufacturer_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE CASCADE,
  collection_name TEXT,
  door_style TEXT,
  sku TEXT,
  price DECIMAL,
  raw_source_file_id UUID REFERENCES manufacturer_files(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. NKBA Rules
CREATE TABLE IF NOT EXISTS nkba_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT,
  file_name TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Quotation Projects
CREATE TABLE IF NOT EXISTS quotation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT,
  status TEXT DEFAULT 'Draft',
  manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE SET NULL,
  selected_collection TEXT,
  selected_door_style TEXT,
  selected_finish TEXT,
  selected_hardware TEXT,
  raw_pdf_url TEXT,
  extracted_data JSONB,
  bom_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Quotation BOMs
CREATE TABLE IF NOT EXISTS quotation_boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES quotation_projects(id) ON DELETE CASCADE,
  sku TEXT,
  matched_sku TEXT,
  qty INTEGER DEFAULT 1,
  unit_price DECIMAL,
  line_total DECIMAL,
  room TEXT,
  collection TEXT,
  door_style TEXT,
  price_source TEXT,
  precision_level TEXT, -- EXACT, PARTIAL, FUZZY, NOT_FOUND
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## AI Configuration
- Model: Gemini 2.0 Flash
- Max Duration: 300s (for large architectural sets)
