"use client"

import React, { useState, useEffect } from 'react';
import { useWasm } from '../hooks/useWasm';

const WASM = () => {
    const [Module, setModule] = useState(null);

    useEffect(() => {
        const loadWasm = async () => {
            const wasmModule = await import('./libstream.wasm');
            setModule(wasmModule);
        };
        
        loadWasm();
    }, []);

    const instance = useWasm();
 
   return <div>WebAssembly</div>;
}

export default WASM