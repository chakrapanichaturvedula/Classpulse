import React from 'react';import {Text} from 'react-native';import type {FacultyPreview} from './facultyCsv';
export function FacultyCsvFiles(_props:{disabled:boolean;onBegin:()=>void;onRead:(p:FacultyPreview)=>void}){return <Text>Open Classpulse in a web browser to upload a CSV list. You can also paste email addresses below.</Text>;}
