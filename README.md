
# KABS Quotation AI - Technical Documentation & User Manual

KABS Quotation AI is a high-precision architectural cabinetry takeoff and pricing platform. It leverages **Gemini 2.0 Flash** for multi-page PDF reasoning and a proprietary **"Universal Jack" Pricing Engine** to automate complex estimations.

---

## 🚀 1. GitHub Repository Setup

To push this project to your repository, run these commands in your local terminal:

```bash
git init
git add .
git commit -m "Initial commit: KABS Quotation AI v72.0"
git branch -M main
git remote add origin https://github.com/Gaura-kbgp/Quotation-AI.git
git push -u origin main
```

---

## 🛠️ 2. Tech Stack
- **Framework**: Next.js 15 (App Router / Standalone Output)
- **AI Engine**: Google Genkit + Gemini 2.0 Flash (Vision & Reasoning)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS + ShadCN UI
- **Deployment**: Render / Docker Optimized (Node.js 20.x LTS)

---

## 📂 3. Environment Setup
Create a `.env` file in the root directory. Use `.env.example` as a template.
*Note: Public keys (NEXT_PUBLIC_) are accessible to the browser, while private keys stay on the server.*

---

## 🔍 4. File Map (System Architecture)

### Core AI & Logic
- `src/ai/flows/analyze-drawing-flow.ts`: The "Brain" for PDF takeoff. Uses Gemini 2.0 to extract cabinets and consolidate them into 5 official rooms.
- `src/lib/specs-parser.ts`: **Greedy Grid Scanner**. Extracts pricing from Excel files row-by-row, ignoring inconsistent headers.
- `src/app/api/generate-bom/route.ts`: **"Universal Jack" Engine**. Performs a 5-tier search (Strict -> Global -> Compressed -> Fuzzy -> Category Average).

### Application Routes
- `/quotation-ai`: PDF Upload & Processing.
- `/quotation-ai/review/[id]`: Interactive Takeoff Review (Merge/Edit/Delete).
- `/quotation-ai/bom/[id]`: Pricing Workstation & Professional Proposal Generator.
- `/admin/*`: Manufacturer, Pricing Guide, and NKBA Rule Management.

---

## 📘 5. User Manual (Workflow)

### Step 1: Data Onboarding (Admin)
1. Navigate to **Admin Access** (admin@kabs.com / admin123).
2. Create a **Manufacturer**.
3. Upload a **Pricing File** (.xlsx). The "Greedy Grid" parser will automatically scan all sheets for SKU/Price pairs.

### Step 2: AI Takeoff (Estimator)
1. Click **Start Quotation** on the home page.
2. Upload the Full Architectural PDF.
3. The AI will extract cabinets into 5 Official Rooms.

### Step 3: Review & Pricing
1. Review the detected counts in the **Review Page**.
2. Select the **Manufacturer Brand** and **Collection/Style**.
3. Click **Generate Quotation**.

### Step 4: Final Proposal
1. In the BOM manager, uncheck any accessories not needed for the bid.
2. Adjust **Discounts**, **Logistics Fees**, and **Tax Rates**.
3. Click **Print Proposal** for a professional A4 PDF output.

---

## 🌍 6. Deployment on Render

1. **GitHub Connection**: Connect your repository to Render.
2. **Build Settings**:
   - **Runtime**: Node.js (Version locked to 20.x in package.json)
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
3. **Environment Variables**: Add all keys from your `.env` to the Render Dashboard.

---

## 🗄️ 7. Supabase SQL Schema
Run this SQL in your Supabase SQL Editor to initialize your database:

```sql
CREATE TABLE manufacturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE manufacturer_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manufacturer_id UUID REFERENCES manufacturers(id),
  file_type TEXT,
  file_name TEXT,
  file_url TEXT,
  file_format TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE manufacturer_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manufacturer_id UUID REFERENCES manufacturers(id),
  collection_name TEXT,
  door_style TEXT,
  sku TEXT,
  price NUMERIC,
  raw_source_file_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quotation_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_name TEXT,
  status TEXT DEFAULT 'Draft',
  manufacturer_id UUID REFERENCES manufacturers(id),
  raw_pdf_url TEXT,
  extracted_data JSONB,
  bom_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quotation_boms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES quotation_projects(id),
  sku TEXT,
  matched_sku TEXT,
  qty INTEGER,
  unit_price NUMERIC,
  line_total NUMERIC,
  room TEXT,
  price_source TEXT,
  precision_level TEXT,
  is_billable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
