import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// A parse error prevents the entire app module from reaching its login screen.
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('./app.js', import.meta.url))], {stdio:'pipe'});
console.log('App startup: production module parses successfully');
