// ==========================================
// BSITHUB Supabase Configuration
// ==========================================
// Replace these with your actual Supabase credentials
// Get them from: https://app.supabase.com → Project Settings → API

const SUPABASE_CONFIG = {
    url: 'https://subxplngqssarxmmkxun.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1YnhwbG5ncXNzYXJ4bW1reHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTQyNzIsImV4cCI6MjA5MDg3MDI3Mn0.W-Fm37REyV-IzhVvpW9wVRsdQo3OzmqTLlxkcCBQfnw'
};

// Export for use
window.SUPABASE_URL = SUPABASE_CONFIG.url;
window.SUPABASE_ANON_KEY = SUPABASE_CONFIG.anonKey;

// Initialize Supabase when config is loaded
if (typeof window.supabase !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    console.log('Supabase client initialized');
}
