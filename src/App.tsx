/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lightbulb, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Brain,
  ChevronRight,
  Info,
  Moon,
  Sun
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// --- Types ---
type SudokuGrid = (number | null)[][];

interface Hint {
  row: number;
  col: number;
  value: number;
  reason: string;
  strategy: string;
}

// --- Constants ---
const EMPTY_GRID: SudokuGrid = Array(9).fill(null).map(() => Array(9).fill(null));

// --- Sudoku Logic ---

const isValid = (grid: SudokuGrid, row: number, col: number, num: number): boolean => {
  // Check row
  for (let x = 0; x < 9; x++) {
    if (grid[row][x] === num) return false;
  }
  // Check column
  for (let x = 0; x < 9; x++) {
    if (grid[x][col] === num) return false;
  }
  // Check 3x3 box
  const startRow = row - (row % 3);
  const startCol = col - (col % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[i + startRow][j + startCol] === num) return false;
    }
  }
  return true;
};

const getCandidates = (grid: SudokuGrid, row: number, col: number): number[] => {
  if (grid[row][col] !== null) return [];
  const candidates: number[] = [];
  for (let num = 1; num <= 9; num++) {
    if (isValid(grid, row, col, num)) {
      candidates.push(num);
    }
  }
  return candidates;
};

const findNextMove = (grid: SudokuGrid): Hint | null => {
  // 1. Scanning in one direction (Hidden Single in Box - Row or Col based)
  for (let b = 0; b < 9; b++) {
    const startRow = Math.floor(b / 3) * 3;
    const startCol = (b % 3) * 3;
    for (let num = 1; num <= 9; num++) {
      // Check if num is already in box
      let inBox = false;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (grid[startRow + i][startCol + j] === num) inBox = true;
        }
      }
      if (inBox) continue;

      const possibleCells: { r: number; c: number }[] = [];
      let rowsWithNum = 0;
      let colsWithNum = 0;

      for (let i = 0; i < 3; i++) {
        const r = startRow + i;
        let rowHasNum = false;
        for (let x = 0; x < 9; x++) if (grid[r][x] === num) rowHasNum = true;
        if (rowHasNum) rowsWithNum++;

        for (let j = 0; j < 3; j++) {
          const c = startCol + j;
          if (i === 0) { // Only check columns once
            let colHasNum = false;
            for (let x = 0; x < 9; x++) if (grid[x][c] === num) colHasNum = true;
            if (colHasNum) colsWithNum++;
          }

          if (grid[r][c] === null && isValid(grid, r, c, num)) {
            possibleCells.push({ r, c });
          }
        }
      }

      if (possibleCells.length === 1) {
        const strategy = (rowsWithNum >= 2 || colsWithNum >= 2) 
          ? 'Scanning in one direction' 
          : 'Scanning in two directions';
        
        return {
          row: possibleCells[0].r,
          col: possibleCells[0].c,
          value: num,
          strategy,
          reason: `By scanning the ${rowsWithNum >= 2 ? 'rows' : 'columns'} intersecting this box, we can see that ${num} can only fit in this one square.`
        };
      }
    }
  }

  // 3. Searching for Single Candidates (Naked Single)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === null) {
        const nums = getCandidates(grid, r, c);
        if (nums.length === 1) {
          return {
            row: r,
            col: c,
            value: nums[0],
            strategy: 'Searching for Single Candidates',
            reason: `This square is the only one in its row, column, and box that can hold the number ${nums[0]} because all other numbers are already present in the surrounding area.`
          };
        }
      }
    }
  }

  // 5. Searching for missing numbers in rows and columns (Hidden Single in Row/Col)
  // Check Rows
  for (let r = 0; r < 9; r++) {
    for (let num = 1; num <= 9; num++) {
      let possibleCols: number[] = [];
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === null && isValid(grid, r, c, num)) possibleCols.push(c);
      }
      if (possibleCols.length === 1) {
        return {
          row: r,
          col: possibleCols[0],
          value: num,
          strategy: 'Searching for missing numbers in rows',
          reason: `In row ${r + 1}, the number ${num} is missing and can only fit in this specific column.`
        };
      }
    }
  }

  // Check Columns
  for (let c = 0; c < 9; c++) {
    for (let num = 1; num <= 9; num++) {
      let possibleRows: number[] = [];
      for (let r = 0; r < 9; r++) {
        if (grid[r][c] === null && isValid(grid, r, c, num)) possibleRows.push(r);
      }
      if (possibleRows.length === 1) {
        return {
          row: possibleRows[0],
          col: c,
          value: num,
          strategy: 'Searching for missing numbers in columns',
          reason: `In column ${c + 1}, the number ${num} is missing and can only fit in this specific row.`
        };
      }
    }
  }

  return null;
};

// --- App Component ---

export default function App() {
  const [grid, setGrid] = useState<SudokuGrid>(EMPTY_GRID);
  const [hint, setHint] = useState<Hint | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Initialize dark mode from system preference or local storage
  useEffect(() => {
    const savedMode = localStorage.getItem('sudoku-sensei-dark');
    if (savedMode !== null) {
      setDarkMode(savedMode === 'true');
    } else {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sudoku-sensei-dark', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleCellChange = (row: number, col: number, value: string) => {
    const num = value === '' ? null : parseInt(value);
    if (num !== null && (isNaN(num) || num < 1 || num > 9)) return;

    const newGrid = grid.map((r, ri) => 
      ri === row ? r.map((c, ci) => ci === col ? num : c) : r
    );

    // Basic validation on input
    if (num !== null) {
      const tempGrid = grid.map((r, ri) => 
        ri === row ? r.map((c, ci) => ci === col ? null : c) : r
      );
      if (!isValid(tempGrid, row, col, num)) {
        setError(`Number ${num} is not valid at [${row + 1}, ${col + 1}]`);
        setTimeout(() => setError(null), 3000);
        return;
      }
    }

    setGrid(newGrid);
    setHint(null);
    setAiExplanation(null);
  };

  const getHint = async () => {
    setLoadingHint(true);
    setError(null);
    
    const nextMove = findNextMove(grid);
    
    if (!nextMove) {
      setError("No obvious next move found. The puzzle might be too complex or invalid.");
      setLoadingHint(false);
      return;
    }

    setHint(nextMove);

    // Use Gemini to provide a more detailed, human-like explanation
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `
        I am solving a Sudoku puzzle. 
        The current grid state is: ${JSON.stringify(grid)}
        I found a move: Put ${nextMove.value} at row ${nextMove.row + 1}, column ${nextMove.col + 1}.
        The strategy used is: ${nextMove.strategy}.
        The basic reason is: ${nextMove.reason}.
        
        Please provide a concise, encouraging, and clear explanation of why this move is correct. 
        Explain it like a Sudoku teacher. Use the strategy name "${nextMove.strategy}" in your explanation and relate it to the specific grid coordinates if helpful.
        Keep it under 3 sentences.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiExplanation(response.text || nextMove.reason);
    } catch (err) {
      console.error("Gemini Error:", err);
      setAiExplanation(nextMove.reason);
    } finally {
      setLoadingHint(false);
    }
  };

  const applyHint = () => {
    if (!hint) return;
    const newGrid = grid.map((r, ri) => 
      ri === hint.row ? r.map((c, ci) => ci === hint.col ? hint.value : c) : r
    );
    setGrid(newGrid);
    setHint(null);
    setAiExplanation(null);
  };

  const clearGrid = () => {
    if (window.confirm("Are you sure you want to clear the entire grid?")) {
      setGrid(EMPTY_GRID);
      setHint(null);
      setAiExplanation(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#0A0A0A] text-[#141414] dark:text-[#E0E0E0] font-sans p-4 md:p-8 selection:bg-[#5A5A40] selection:text-white transition-colors duration-300">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Header & Grid */}
        <div className="lg:col-span-7 space-y-8">
          <header className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#5A5A40] rounded-lg">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-4xl font-serif italic font-medium tracking-tight">Sudoku Sensei</h1>
              </div>
              <p className="text-[#5A5A40]/70 dark:text-[#5A5A40]/90 text-sm font-medium uppercase tracking-widest">Your Intelligent Solving Companion</p>
            </div>
            
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-3 rounded-2xl bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 shadow-lg shadow-black/5 transition-all active:scale-95"
            >
              {darkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-[#5A5A40]" />}
            </button>
          </header>

          <div className="relative group">
            {/* Sudoku Grid */}
            <div className="bg-white dark:bg-[#1A1A1A] p-4 rounded-3xl shadow-xl shadow-black/5 border border-black/5 dark:border-white/5 transition-colors">
              <div className="grid grid-cols-9 border-2 border-[#141414] dark:border-[#E0E0E0]">
                {grid.map((row, ri) => (
                  row.map((val, ci) => {
                    const isHintCell = hint?.row === ri && hint?.col === ci;
                    const isSameValue = hint && val === hint.value;
                    const isHintLine = hint && (hint.row === ri || hint.col === ci);

                    return (
                      <div 
                        key={`${ri}-${ci}`}
                        className={cn(
                          "relative aspect-square border border-[#141414]/20 dark:border-[#E0E0E0]/20 flex items-center justify-center transition-all duration-300",
                          ci % 3 === 2 && ci !== 8 && "border-r-2 border-r-[#141414] dark:border-r-[#E0E0E0]",
                          ri % 3 === 2 && ri !== 8 && "border-b-2 border-b-[#141414] dark:border-b-[#E0E0E0]",
                          isHintCell && "bg-[#5A5A40]/20 dark:bg-[#5A5A40]/40",
                          !isHintCell && isHintLine && "bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10",
                          !isHintCell && isSameValue && "bg-[#5A5A40]/15 dark:bg-[#5A5A40]/30"
                        )}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          value={val || ''}
                          onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                          className={cn(
                            "w-full h-full text-center text-2xl font-mono focus:outline-none focus:bg-[#5A5A40]/5 transition-colors bg-transparent",
                            val === null && "text-transparent",
                            isHintCell && "text-[#5A5A40] font-bold",
                            !isHintCell && isSameValue && "text-[#5A5A40] font-bold",
                            !isHintCell && !isSameValue && "text-[#141414] dark:text-[#E0E0E0]"
                          )}
                          maxLength={1}
                        />
                        {isHintCell && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          >
                            <span className="text-2xl font-mono font-bold text-[#5A5A40]">{hint.value}</span>
                          </motion.div>
                        )}
                      </div>
                    );
                  })
                ))}
              </div>
            </div>

            {/* Error Toast */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute -bottom-12 left-0 right-0 flex justify-center"
                >
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-red-100 dark:border-red-900/30 shadow-lg">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={getHint}
              disabled={loadingHint}
              className="flex-1 min-w-[160px] bg-[#5A5A40] text-white px-6 py-4 rounded-2xl font-medium flex items-center justify-center gap-3 hover:bg-[#4A4A30] transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-[#5A5A40]/20"
            >
              {loadingHint ? (
                <RotateCcw className="w-5 h-5 animate-spin" />
              ) : (
                <Lightbulb className="w-5 h-5" />
              )}
              {loadingHint ? "Thinking..." : "Analyze Next Move"}
            </button>
            
            <button
              onClick={clearGrid}
              className="bg-white dark:bg-[#1A1A1A] border border-black/10 dark:border-white/10 text-[#141414] dark:text-[#E0E0E0] px-6 py-4 rounded-2xl font-medium flex items-center justify-center gap-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-all active:scale-95 shadow-lg shadow-black/5"
            >
              <Trash2 className="w-5 h-5" />
              Clear Grid
            </button>
          </div>
        </div>

        {/* Right Column: Explanation Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-3xl p-8 border border-black/5 dark:border-white/5 shadow-xl shadow-black/5 min-h-[400px] flex flex-col transition-colors">
            <div className="flex items-center gap-2 mb-6">
              <Info className="w-5 h-5 text-[#5A5A40]" />
              <h2 className="text-xl font-serif italic font-medium">Sensei's Guidance</h2>
            </div>

            <AnimatePresence mode="wait">
              {hint ? (
                <motion.div
                  key="hint-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="mb-8 p-6 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-2xl border border-[#5A5A40]/10">
                    <div className="text-xs font-mono uppercase tracking-widest text-[#5A5A40]/60 mb-2">Recommended Move</div>
                    <div className="text-3xl font-mono font-bold flex items-center gap-3">
                      <span>Cell [{hint.row + 1}, {hint.col + 1}]</span>
                      <ChevronRight className="w-6 h-6 text-[#5A5A40]/30" />
                      <span className="text-[#5A5A40]">Value {hint.value}</span>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-[#5A5A40]/60 mb-1">Strategy</div>
                      <div className="text-lg font-medium">{hint.strategy}</div>
                    </div>

                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-[#5A5A40]/60 mb-1">Explanation</div>
                      <div className="text-[#141414]/80 dark:text-[#E0E0E0]/80 leading-relaxed italic font-serif text-lg">
                        {aiExplanation || "Analyzing the logic..."}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={applyHint}
                    className="mt-8 w-full bg-[#141414] dark:bg-[#E0E0E0] text-white dark:text-[#141414] py-4 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-black dark:hover:bg-white transition-all active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Apply This Move
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center text-center space-y-4 text-[#141414]/40 dark:text-[#E0E0E0]/20"
                >
                  <div className="p-6 rounded-full bg-[#F5F5F0] dark:bg-[#0A0A0A]">
                    <Lightbulb className="w-12 h-12" />
                  </div>
                  <div className="max-w-[240px]">
                    <p className="font-serif italic text-lg">"The path to mastery begins with a single number."</p>
                    <p className="text-sm mt-2 font-sans">Enter some numbers in the grid and click 'Analyze' to receive guidance.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Tips */}
          <div className="bg-[#5A5A40] text-white rounded-3xl p-6 space-y-4 shadow-lg shadow-[#5A5A40]/20">
            <h3 className="font-serif italic text-lg">Sudoku Wisdom</h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                <span>Focus on rows or boxes with the most numbers already filled.</span>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                <span>Look for 'Naked Singles'—cells where only one number is mathematically possible.</span>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                <span>Use the 'Analyze' button whenever you feel stuck; I'll explain the logic step-by-step.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
