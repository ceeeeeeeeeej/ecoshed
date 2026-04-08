
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://bfqktqtsjchbmopafgzf.supabase.co';
const supabaseKey = 'YOUR_KEY_HERE'; // I need to find the key in the codebase
const supabase = createClient(supabaseUrl, supabaseKey);

async function testJoin() {
    try {
        const { data, error } = await supabase
            .from('special_collections')
            .select('*, users!resident_id(first_name, last_name)')
            .limit(1);

        console.log('Data:', data);
        console.log('Error:', error);
    } catch (e) {
        console.error('Catch error:', e);
    }
}

testJoin();
