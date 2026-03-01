# KABS Quotation AI - Technical Documentation & User Manual

KABS Quotation AI is a high-precision architectural cabinetry takeoff and pricing platform. It leverages **Gemini 2.0 Flash** for multi-page PDF reasoning and a proprietary **"Universal Jack" Pricing Engine** to automate complex estimations.

---

## 🚀 1. Tech Stack
- **Framework**: Next.js 15 (App Router / Standalone Output)
- **AI Engine**: Google Genkit + Gemini 2.0 Flash (Vision & Reasoning)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS + ShadCN UI
- **Deployment**: Render / Docker Optimized

---

## 🛠️ 2. Environment Setup
Create a `.env` file in the root directory and populate it with the following keys. 
*Note: Public keys (NEXT_PUBLIC_) are accessible to the browser, while private keys stay on the server.*

Refer to `.env.example` for the required keys.

---

## 📂 3. File Map (System Architecture)

### Core AI & Logic
- `src/ai/flows/analyze-drawing-flow.ts`: The "Brain" for PDF takeoff. Uses Gemini 2.0 to extract cabinets and consolidate them into 5 official rooms.
- `src/lib/specs-parser.ts`: **Greedy Grid Scanner**. Extracts pricing from Excel files row-by-row, ignoring inconsistent headers.
- `src/app/api/generate-bom/route.ts`: **"Universal Jack" Engine**. Performs a 5-tier search (Strict -> Global -> Compressed -> Fuzzy -> Category Average).

### Application Routes
- `/quotation-ai`: PDF Upload & Processing.
- `/quotation-ai/review/[id]`: Interactive Takeoff Review (Merge/Edit/Delete).
- `/quotation-ai/bom/[id]`: Pricing Workstation & Professional Proposal Generator.
- `/admin/*`: Manufacturer, Pricing Guide, and NKBA Rule Management.

### Shared Components
- `src/components/ui/*`: Reusable ShadCN interface elements.
- `src/lib/utils.ts`: SKU Normalization and Cabinet Classification logic.

---

## 📘 4. User Manual (Workflow)

### Step 1: Data Onboarding (Admin)
1. Navigate to **Admin Access** (admin@kabs.com / admin123).
2. Create a **Manufacturer**.
3. Upload a **Pricing File** (.xlsx). The "Greedy Grid" parser will automatically scan all sheets for SKU/Price pairs.
4. Summary cards will update with "Total Active SKUs" found.

### Step 2: AI Takeoff (Estimator)
1. Click **Start Quotation** on the home page.
2. Upload the Full Architectural PDF.
3. Wait ~60-90s. The AI will extract cabinets and automatically merge sections like "Island" or "Laundry" into one of the **5 Official Rooms**.

### Step 3: Review & Pricing
1. Review the detected counts in the **Review Page**.
2. Select the **Manufacturer Brand** and **Collection/Style** for each room.
3. Click **Generate Quotation**.

### Step 4: Final Proposal
1. In the BOM manager, uncheck any accessories not needed for the bid.
2. Adjust **Discounts**, **Logistics Fees**, and **Tax Rates**.
3. Enter Client Details and click **Print Proposal** for a professional A4 PDF output.

---

## 🌍 5. Deployment on Render

### Standard Process
1. **GitHub Connection**: Connect your repository to Render.
2. **Environment Variables**: Copy all keys from your `.env` to the Render Dashboard.
3. **Build Settings**:
   - **Runtime**: Node.js
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`

---

## 🗄️ 6. Supabase SQL Schema
Run the SQL found in the project documentation within your Supabase SQL Editor to initialize your database tables.
