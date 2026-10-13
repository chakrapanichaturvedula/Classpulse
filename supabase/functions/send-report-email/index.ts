import {handleReportEmail} from './handler.ts';
Deno.serve(req=>handleReportEmail(req));
