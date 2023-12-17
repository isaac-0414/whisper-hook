"use client";

import { useEffect, useState } from "react";

export default function WhisperPage() {

   return (
     <>
       <div id="main-container">
         <b>stream : Real-time Whisper transcription in WebAssembly</b>

         <hr />

         Select the model you would like to use, click the "Start" button and start speaking

         <br />

         <div id="model-whisper">
            Whisper model: <span id="model-whisper-status"></span>
            <button id="fetch-whisper-tiny-en">tiny.en (75 MB)</button>
            <button id="fetch-whisper-base-en">base.en (142 MB)</button>
            <span id="fetch-whisper-progress"></span>
         </div>

         <br />

         <div id="input">
            <button id="start" disabled>Start</button>
            <button id="stop" disabled>Stop</button>
            <button id="clear">Clear Cache</button>
         </div>

         <br />

         <div id="state">
            Status: <b><span id="state-status">not started</span></b>

            <pre id="state-transcribed">[The transcribed text will be displayed here]</pre>
         </div>

         <hr />

         Debug output:
         <textarea id="output" rows={20}></textarea>

         <br />

         <b>Troubleshooting</b>

         <br />

         The page does some heavy computations, so make sure:

         <ul>
            <li>To use a modern web browser (e.g. Chrome, Firefox)</li>
            <li>To use a fast desktop or laptop computer (i.e. not a mobile phone)</li>
            <li>Your browser supports WASM <a href="https://webassembly.org/roadmap/">Fixed-width SIMD</a></li>
         </ul>
      </div>
      <script type="text/javascript" src="/stream.js"></script>
      <script type="text/javascript" src="/helper.js"></script>
     </>
   );
}
