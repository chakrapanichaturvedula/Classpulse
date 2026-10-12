import {existsSync} from 'node:fs';

// Local exports use the ignored .env file; CI receives settings from the hosting provider.
if(existsSync('.env'))process.loadEnvFile('.env');
const url=process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()??'';
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()??'';
const invalid=[];
try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)invalid.push('EXPO_PUBLIC_SUPABASE_URL');}catch{invalid.push('EXPO_PUBLIC_SUPABASE_URL');}
if(!key.startsWith('sb_publishable_'))invalid.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if(invalid.length){
 console.error(`Cannot build Classpulse: missing or invalid ${invalid.join(', ')}. Set these build environment variables for Production and rebuild. Use the public publishable key.`);
 process.exit(1);
}
console.log('Classpulse: public Supabase build configuration verified.');
