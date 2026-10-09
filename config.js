/* ==========================================================
   MGTCG — config.js
   Colle ici les 2 infos de ton projet Supabase
   (Supabase → Project Settings → API).

   👉 La clé « anon / publishable » est FAITE pour être publique :
      elle peut être sur GitHub sans danger. La vraie protection,
      ce sont les règles de sécurité (RLS) du fichier supabase-setup.sql.

   ⚠️ Ne mets JAMAIS ici la clé « service_role » / « secret ».
   ========================================================== */
window.MG = window.MG || {};
window.MG.config = {
  SUPABASE_URL: "",       // ex : "https://abcdefghijk.supabase.co"
  SUPABASE_ANON_KEY: "",  // ex : "eyJhbGciOi..." ou "sb_publishable_..."
};
