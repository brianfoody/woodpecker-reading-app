"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

// Mock audio function
const playAudio = (text: string) => {
  console.log(`Playing audio for: "${text}"`)
  // In a real app, this would use Web Speech API or audio files
  // if ('speechSynthesis' in window) {
  //   const utterance = new SpeechSynthesisUtterance(text)
  //   speechSynthesis.speak(utterance)
  // }
}

export default function ReadingApp() {
  const [sentence, setSentence] = useState("The brown mouse runs fast")
  const [inputSentence, setInputSentence] = useState("The brown mouse runs fast")
  const [isCreating, setIsCreating] = useState(false)
  const words = sentence.split(" ")

  const [activeWord, setActiveWord] = useState<number | null>(null)
  const [swipeWords, setSwipeWords] = useState<number[]>([])
  const [isAnimating, setIsAnimating] = useState(false) // Controls overall animation state (tap or sequence)
  const [isSwiping, setIsSwiping] = useState(false) // Controls if a swipe gesture is active (pointer down and moving)

  const containerRef = useRef<HTMLDivElement>(null)
  const [pointerStart, setPointerStart] = useState<{ x: number; y: number } | null>(null)

  // Handle sentence creation with simulated audio generation
  const handleCreateSentence = useCallback(async () => {
    if (!inputSentence.trim() || isCreating) return

    setIsCreating(true)
    // Clear any active interactions
    setActiveWord(null)
    setSwipeWords([])
    setIsAnimating(false)
    setIsSwiping(false)

    // Simulate audio generation with 5-second delay
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Update the sentence after "generation"
    setSentence(inputSentence)
    setIsCreating(false)
  }, [inputSentence, isCreating])

  // Unified pointer handlers for mouse and touch
  const getClientCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    return { x: e.clientX, y: e.clientY }
  }

  const animateWordSequence = useCallback(
    async (indices: number[]) => {
      setIsAnimating(true)
      const sortedIndices = [...indices].sort((a, b) => a - b)
      for (const index of sortedIndices) {
        setActiveWord(index)
        playAudio(words[index])
        await new Promise((resolve) => setTimeout(resolve, 600)) // Animate each word for 0.6s
        setActiveWord(null)
      }
      setIsAnimating(false)
    },
    [words],
  )

  const handleWordTap = useCallback(
    (index: number, word: string) => {
      if (isAnimating || isSwiping || isCreating) return // Prevent tap during swipe, sequence animation, or creation

      setActiveWord(index)
      setIsAnimating(true)
      playAudio(word)

      setTimeout(() => {
        setActiveWord(null)
        setIsAnimating(false)
      }, 800) // Single word animation duration
    },
    [isAnimating, isSwiping, isCreating],
  )

  const handlePointerStart = useCallback((e: React.MouseEvent | React.TouchEvent, index: number) => {
    e.preventDefault() // Prevent browser scroll/selection
    if (isAnimating || isCreating) return // Prevent new gesture during animation or creation

    const coords = getClientCoords(e)
    setPointerStart(coords)
    setSwipeWords([index])
    setIsSwiping(true) // Indicate that a swipe gesture has started
  }, [isAnimating, isCreating])

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!pointerStart || !isSwiping) return // Only process if a swipe is active

      e.preventDefault() // Prevent browser scroll/selection

      const coords = getClientCoords(e)
      const element = document.elementFromPoint(coords.x, coords.y)
      const wordElement = element?.closest("[data-word-index]")

      if (wordElement) {
        const wordIndex = Number.parseInt(wordElement.getAttribute("data-word-index") || "0")
        setSwipeWords((prev) => {
          const newWords = [...prev]
          if (!newWords.includes(wordIndex)) {
            const minIndex = Math.min(...newWords)
            const maxIndex = Math.max(...newWords)

            // Allow adding words that extend the range or fill gaps
            if (
              wordIndex === maxIndex + 1 ||
              wordIndex === minIndex - 1 ||
              (wordIndex > minIndex && wordIndex < maxIndex)
            ) {
              newWords.push(wordIndex)
            }
          }
          return newWords
        })
      }
    },
    [pointerStart, isSwiping],
  )

  const handlePointerEnd = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault() // Prevent any default behavior

      if (isSwiping) { // Only process if a swipe was active
        if (swipeWords.length > 0) { // If any words were swiped
          // Play combined audio first
          playAudio(swipeWords.sort((a, b) => a - b).map((index) => words[index]).join(" "))

          // Then animate each word in sequence
          animateWordSequence(swipeWords)
        }
        setPointerStart(null)
        setIsSwiping(false) // End the swipe gesture
        setTimeout(() => setSwipeWords([]), 500); // Clear swiped words after a short delay
      }
    },
    [swipeWords, words, isSwiping, animateWordSequence],
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8 flex items-center justify-center">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-purple-800 mb-4">{"✨ Reading Magic ✨"}</h1>
          <p className="text-lg text-gray-600">Tap words to hear them speak, or swipe across words!</p>
        </div>

        {/* Sentence Input */}
        <div className="mb-8">
          <label htmlFor="sentence-input" className="block text-lg font-medium text-gray-700 mb-2">
            Create New Sentence:
          </label>
          <div className="flex gap-3">
            <input
              id="sentence-input"
              type="text"
              value={inputSentence}
              onChange={(e) => setInputSentence(e.target.value)}
              disabled={isCreating}
              className="flex-1 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Type your sentence here..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreateSentence()
                }
              }}
            />
            <motion.button
              onClick={handleCreateSentence}
              disabled={isCreating || !inputSentence.trim()}
              className={`
                px-6 py-3 rounded-lg font-semibold text-white text-lg
                transition-all duration-200 shadow-lg
                ${isCreating 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 active:scale-95'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              whileHover={!isCreating ? { scale: 1.05 } : {}}
              whileTap={!isCreating ? { scale: 0.95 } : {}}
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    ⚙️
                  </motion.span>
                  Creating...
                </span>
              ) : (
                'Create'
              )}
            </motion.button>
          </div>
        </div>

        {/* Reading Area */}
        <div
          ref={containerRef}
          className="bg-white rounded-3xl shadow-2xl p-12 flex flex-col justify-between items-center overflow-hidden relative"
          style={{
            touchAction: "none", // Prevent browser scroll/zoom gestures
            height: "600px", // Fixed height to prevent any layout shifts
            minHeight: "600px",
          }}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerEnd}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerEnd}
          onMouseLeave={handlePointerEnd} // End drag if mouse leaves container
        >
          {/* Loading animation overlay */}
          <AnimatePresence>
            {isCreating && (
              <motion.div
                className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Beautiful pulsing animation */}
                <div className="relative">
                  {/* Outer ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.3, 0.1, 0.3],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    style={{ width: 200, height: 200 }}
                  />
                  
                  {/* Middle ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 0.2, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.3,
                    }}
                    style={{ width: 200, height: 200 }}
                  />
                  
                  {/* Inner circle */}
                  <motion.div
                    className="relative rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center"
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.6,
                    }}
                    style={{ width: 200, height: 200 }}
                  >
                    <span className="text-white text-6xl">🎵</span>
                  </motion.div>
                </div>
                
                {/* Loading text */}
                <motion.div
                  className="mt-8 text-2xl font-semibold text-purple-600"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  Generating audio magic
                  <motion.span
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    ...
                  </motion.span>
                </motion.div>
                
                {/* Progress dots */}
                <div className="mt-4 flex gap-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      className="w-3 h-3 rounded-full bg-purple-400"
                      animate={{
                        scale: [1, 1.5, 1],
                        backgroundColor: ["#c084fc", "#ec489a", "#c084fc"],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content with fade transition */}
          <AnimatePresence mode="wait">
            {!isCreating && (
              <motion.div
                key={sentence} // Key ensures re-render on sentence change
                className="flex flex-col items-center w-full h-full justify-between"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                {/* Top content area */}
                <div className="flex flex-col items-center w-full">
                  {/* Sentence */}
                  <div
                    className="flex flex-wrap justify-center gap-x-6 gap-y-4 mb-8" // Increased gap-x for more uniform spacing
                    style={{ height: "140px" }} // Fixed height for word animations
                  >
                    {words.map((word, index) => (
                      <div key={index} className="flex flex-col items-center">
                        {/* Dynamic-size word container to prevent layout shifts */}
                        <div
                          className="relative flex items-center justify-center h-[80px] px-2" // Added horizontal padding to ensure spacing
                          // Removed minWidth, maxWidth, flexGrow, flexShrink to allow natural width
                        >
                          <motion.div
                            data-word-index={index}
                            className={`
                            text-5xl font-bold cursor-pointer select-none py-1 rounded-xl
                            transition-all duration-300 relative
                            ${activeWord === index ? "text-white" : "text-gray-800"}
                            ${swipeWords.includes(index) && isSwiping ? "bg-yellow-200 ring-4 ring-yellow-300" : "hover:bg-gray-100"}
                            whitespace-nowrap // Ensure word stays on one line, no ellipsis
                          `}
                            onTouchStart={(e) => handlePointerStart(e, index)}
                            onMouseDown={(e) => handlePointerStart(e, index)}
                            onClick={() => handleWordTap(index, word)}
                            animate={{
                              scale: activeWord === index ? 1.2 : (swipeWords.includes(index) && isSwiping) ? 1.05 : 1,
                              rotateZ: activeWord === index ? [-2, 2, -2, 0] : 0,
                            }}
                            transition={{
                              duration: 0.6,
                              ease: "easeInOut",
                            }}
                            style={{
                              willChange: "transform",
                            }}
                          >
                            {/* Magical background for active word */}
                            <AnimatePresence>
                              {activeWord === index && (
                                <motion.div
                                  className="absolute bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl"
                                  style={{ inset: "-10px" }} // Added 10px padding around the word
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  transition={{ duration: 0.3 }}
                                />
                              )}
                            </AnimatePresence>

                            {/* Sparkles for active word */}
                            <AnimatePresence>
                              {activeWord === index && (
                                <>
                                  {[...Array(6)].map((_, i) => (
                                    <motion.div
                                      key={i}
                                      className="absolute text-yellow-300 text-xl pointer-events-none"
                                      style={{
                                        left: `${Math.random() * 100}%`,
                                        top: `${Math.random() * 100}%`,
                                      }}
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{
                                        scale: [0, 1, 0],
                                        opacity: [0, 1, 0],
                                        y: [0, -20, -40],
                                      }}
                                      transition={{
                                        duration: 0.8,
                                        delay: i * 0.1,
                                        ease: "easeOut",
                                      }}
                                    >
                                      ✨
                                    </motion.div>
                                  ))}
                                </>
                              )}
                            </AnimatePresence>

                            <span className="relative z-10">{word}</span>
                          </motion.div>
                        </div>

                        {/* Dot underneath */}
                        <motion.div
                          className={`
                          w-5 h-5 rounded-full mt-1 cursor-pointer
                          ${activeWord === index ? "bg-purple-500" : "bg-gray-400"}
                          ${(swipeWords.includes(index) && isSwiping) ? "bg-yellow-500" : ""}
                        `}
                          onClick={() => handleWordTap(index, word)}
                          animate={{
                            scale: activeWord === index ? [1, 1.5, 1] : ((swipeWords.includes(index) && isSwiping) ? 1.3 : 1),
                            boxShadow:
                              activeWord === index
                                ? "0 0 20px rgba(147, 51, 234, 0.6)"
                                : ((swipeWords.includes(index) && isSwiping)
                                  ? "0 0 15px rgba(234, 179, 8, 0.6)"
                                  : "none"),
                          }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom content area for swipe indicator and instructions */}
                <div className="flex flex-col items-center w-full">
                  {/* Swipe indicator */}
                  <AnimatePresence>
                    {isSwiping && swipeWords.length > 0 && ( // Show "Swiping" when gesture is active
                      <motion.div
                        className="text-center mb-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <div className="text-2xl font-semibold text-purple-600 mb-2">
                          {"🎵 Swiping: "}
                          {swipeWords
                            .sort((a, b) => a - b)
                            .map((index) => words[index])
                            .join(" ")}
                        </div>
                        <div className="text-lg text-gray-500">Release to play!</div>
                      </motion.div>
                    )}
                    {isAnimating && swipeWords.length > 0 && ( // Show "Playing" when sequence animation is active
                      <motion.div
                        className="text-center mb-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <div className="text-2xl font-semibold text-purple-600 mb-2">
                          {"🎵 Playing: "}
                          {words[activeWord!] || ""} {/* Display the currently active word */}
                        </div>
                        <div className="text-lg text-gray-500">Listen closely!</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Instructions - aligned to bottom */}
                  {swipeWords.length === 0 && !activeWord && !isAnimating && !isSwiping && ( // Only show if no swipe, no active word, and no animation
                    <div className="text-center text-gray-500">
                      <div className="text-xl mb-2">👆 Tap any word or dot to hear it</div>
                      <div className="text-xl">👉 Swipe across words to hear them together</div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fun stats */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-4 bg-white rounded-full px-6 py-3 shadow-lg">
            <span className="text-2xl">📚</span>
            <span className="font-semibold text-gray-700">{words.length} words to discover!</span>
          </div>
        </div>
      </div>
    </div>
  )
}