# DopeWrite

For production hosting, environment variables, Supabase, OCR, and ₹99 payment setup, see the [deployment guide](DEPLOYMENT.md).

After deployment, follow the [test-to-live payments checklist](docs/GO_LIVE_CHECKLIST.md) before accepting real customers.

For two-service Docker hosting, use the [Railway / Render deployment instructions](docs/RAILWAY_RENDER_DEPLOYMENT.md).

Supabase Auth, PostgreSQL and private Storage now provide account-based folder workspaces and saved documents. See [Supabase setup](supabase/README.md) before enabling cloud mode.

A Next.js + FastAPI study workspace inspired by the supplied blue-sidebar wireframes. Upload a PDF or PPTX, write a full response and submit it for an overall correctness assessment, then hide the passage and recall its ideas in your own words.

## Run

Requires Node.js 20+ and Python 3.10+. For scanned PDFs, install Tesseract (`brew install tesseract` on macOS or `sudo apt-get install tesseract-ocr` on Ubuntu).

```sh
npm install
npm run dev
```

In a second terminal:

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Set GROQ_API_KEY for intelligent topic detection (optional).
uvicorn backend.main:app --reload --port 8000
```

Open http://localhost:3000. Document extraction requires the backend; no AI key is required. The sample session works without a backend. API docs: http://localhost:8000/docs.

The Next.js server proxies extraction requests to FastAPI. Set BACKEND_URL in .env.local if the backend is hosted elsewhere. FRONTEND_ORIGIN configures direct browser API access; the normal frontend uses a same-origin proxy.

## Behavior and limits

- PDF: pypdf preserves selectable text locally. Pages without readable text are rendered in memory with PDFium and recognized locally by Tesseract; mixed text/scanned PDFs work page by page and blank pages are skipped. Before recognition, scans are converted to grayscale, contrast-corrected, lightly denoised, and deskewed; Tesseract detects page orientation and uses adaptive thresholding. TSV block/paragraph/line coordinates join wrapped sentences within a paragraph and preserve column/block boundaries, heading size changes, lists, and standalone equations without AI rewriting. Review OCR wording in the editor before learning. OCR defaults to English; set OCR_LANGUAGES (for example eng+hin) after installing the matching Tesseract language data. TESSERACT_CMD can specify the executable. OCR has a 30-second per-page and 110-second document budget; split PDFs that time out. No external AI key is needed for OCR. Handwriting, blurry scans, equations and complex tables may need manual corrections. Groq classifies source block IDs into topics, prose, headings, equations, and diagram references. Text for practice is copied from the original blocks, without AI rewriting. Each topic is divided into passages of up to 120 words. Layout whitespace is normalized to spaces; words and punctuation are preserved.
- PPTX: python-pptx extracts text and tables, then splits it into verbatim passages locally. Image-only decks need OCR first. Legacy .ppt files are not supported.
- Document contents are always plain text, never instructions. No model is used to generate or rewrite typing passages.
- Maximum upload: 15 MB and 45,000 extracted characters. Split longer documents into smaller files.
- In configured Supabase mode, each account has private workspace folders. Files, edited text, lesson sections, drafts, flashcards and progress are saved automatically. The explicitly labeled local mode remains temporary.
- Practice scores only after submission; Recall is a questions-only list. Groq assesses factual correctness and key idea coverage against the original prose (60% / 40% weighting). Correct paraphrases and reordered ideas are accepted; wrong claims and missing ideas are listed. Identical whole responses score 100 locally. API errors keep the draft and show a retry message; no approximate score is fabricated. Editing invalidates the previous result. AI scores are estimates, not authoritative grades.
- PDF preview uses the browser PDF viewer. Passage indices are not original page mappings, so use viewer navigation as needed.
- Extraction runs locally; Groq is used only for classification. If no key is configured, or Groq fails, local heuristics provide a clearly labeled fallback. Classifications can be imperfect, especially with complex PDF layouts. Headings, equations, and figure captions appear in a reference panel and are excluded from typing. Images remain in the original document; they are not transcribed. Embedded PDF images and PPTX pictures are marked when detected.
- This is a local development app. Supabase authentication and owner-specific access controls are included; configure the project migration and auth redirect URLs before enabling cloud mode.

## Checks

```sh
npm run build
npm run typecheck
backend/.venv/bin/python -m backend.run_tests
```

The document and practice panels use a two-column layout, including on narrow screens (horizontal scrolling keeps both columns readable).

Topic buttons let you practice topics individually. Passage completion and drafts survive topic switches during the current session, and are saved across refreshes in Supabase mode.

Non-identical response assessment uses GROQ_API_KEY and GROQ_MODEL. POST /api/evaluate accepts source and response strings and returns a validated assessment. Reference-only material is excluded from the assessment source.

Guided practice places gray source hints behind the typing field, with no per-character comparison, WPM, or live accuracy. The PDF stays in the left column. Submission shows a retention review; guided practice is labeled as assisted, and Recall hides the hints for an unaided attempt.

Document AI (top right) edits only the selected passage through /api/processing-chat. Only that passage and its reference items are sent to Groq; document-wide source blocks and other passages are never used as chat context. It can split/rename the selected passage, include/exclude its original blocks, and adjust its passage length (20–300 words). Source block IDs and classifications are validated before applying; practice text always comes from the immutable source. Changes and Undo reset only affected practice attempts; unrelated drafts and retention results are preserved using stable section IDs. Chat history and undo versions are isolated to the current selection and reset when switching sections, uploading, or refreshing. GROQ_API_KEY is required; unavailable or invalid AI changes leave the session unchanged.

Processing chat uses a bounded outline of only the selected section and small edit operations. Omitted blocks remain unchanged unless selected by a topic/type/text rule. Oversized Groq requests retry once with a smaller outline; rate limits, timeouts, and provider failures leave document state unchanged.

Typing-only edits: AI changes the right-hand typing target, title, and hints; the original PDF and source text/title on the left are immutable. Inline hints show only a short next continuation. Tab accepts the suggestion, Esc dismisses it, and editing in the middle hides it. No WPM or live correctness scoring is performed. Run `npm run test:frontend` for completion, scope isolation, immutable-source, and Undo regression checks.

Active recall: Recall mode uses full-width flashcards with no left prompt/source panel. Each selected passage gets a session-cached question deck grounded in exact source excerpts. Show answer (or Space) reveals the supporting excerpt; self-rate Again, Hard, Good, or Easy (keys 1–4). Again requeues that card at the end; other ratings advance. Completion offers Review again. Deck position and ratings survive passage switches within this app session. Progress is saved in cloud mode; calendar-based repetition scheduling is not implemented. Practice keeps its two-column PDF and typing layout.

Hold a topic button for 500 ms (mouse, touch, or keyboard Space/Enter) to temporarily reveal all typing passages in that topic in red. Release, cancel, move away, or lose focus to hide them. A short click still selects the topic. Peeking does not modify drafts or submit answers. Recall questions do not track or score answers.

## Edit before learning

New uploads now open a document editor first. `/api/prepare` extracts editable blocks without sending the document to AI or creating a practice session. Users correct text, mark Topic heading/Subheading or Normal text, and mark equations/diagrams/reference exclusions in a Docs-style toolbar. The outline follows their heading choices. Compare original opens the uploaded PDF (or extracted PPTX text).

Start learning posts the reviewed blocks to `/api/review`, which trusts the user's classifications and corrections, preserves the revised wording, and builds topics locally. No AI reclassification happens at this step. Edit content reopens the retained draft; starting again rebuilds the session and resets practice/recall progress. Original upload bytes are unchanged. Draft text and formatting are saved to the selected Supabase workspace in cloud mode; local mode retains them only in memory.

Fragmented PDF text layers: pages with at least 10 nonempty rows and 60% single-word rows are treated as unusable extraction, not prose. The backend first tries native visual layout recovery with a word-preservation check, then re-reads the visible page with OCR if necessary. Still-fragmented OCR is rejected with a page-specific error rather than sent to the editor. Re-upload existing documents to apply extraction changes; current editor content is not modified automatically.

Delete documents with the trash button on a folder’s document card. After confirmation, the original file is removed from Supabase Storage and the document record (including edited notes and saved study progress) is deleted from PostgreSQL. Deletion is permanent; the folder and other documents remain. Existing Supabase policies support this without another migration.

Google sign-in is available through Supabase Auth. Configure the Google provider using [the Google OAuth setup guide](supabase/GOOGLE_AUTH.md); the app supports PKCE session exchange, account selection, provider-disabled feedback and cancellation handling.

## Landing page and pricing

The public landing page is `/`; the authenticated workspace is `/app`. Authentication normally returns to `/app`; checkout sign-in returns to `/checkout` through the same `/auth/callback` handler with an allowlisted `next` parameter. Add the checkout callback URL to the Supabase redirect allowlist as described in the payment guide. The landing page includes a local interactive preview, the product flow, feature examples, FAQs, and ₹99 one-time pricing. Its preview data is illustrative and does not modify account documents.

The pricing button opens `/checkout`, which links the purchase to a Supabase account and starts a server-created Dodo hosted session. The product must be a fixed, tax-exclusive ₹99 INR one-time product. The return page waits for verified webhook records; query parameters never confirm a purchase. See [Dodo checkout setup](docs/DODO_CHECKOUT.md) for the required environment, migration and dashboard steps. Workspace access now requires a server-verified purchase. `/app`, all study API routes, and FastAPI deny unpaid accounts; verification failures fail closed. Apply `202610170004_paid_workspace_access.sql` to enforce the same rule on direct Supabase database and Storage access.

## Dodo Payments webhook handlers

`POST /api/webhooks/dodo` verifies `payment.succeeded` and `subscription.active` deliveries and records them in Supabase with transactional deduplication. See [setup, migration, and signed testing instructions](docs/DODO_WEBHOOKS.md). Checkout uses these records for account-linked purchase confirmation. Paid workspace access is enforced by the server; apply the paid-access migration for direct database and Storage protection. Run `npm run test:payments` for the request and persistence tests.

## Full-screen typing focus

Use the expand button inside the practice canvas to enter dark full-screen typing. The existing passage, draft, inline suggestions and retention review stay mounted. Press Escape or the collapse button to return to the split workspace. Tab still accepts the next inline hint. Focus mode fills the browser viewport without requiring browser fullscreen permissions. Background navigation is inert while focusing and restored on exit.
