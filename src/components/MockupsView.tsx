import React, { useState } from 'react';
import { Bookmark, Clock, Archive, XCircle, PlayCircle, Star, CheckCircle2, MoreVertical, ChevronDown, ChevronUp, ChevronRight, Plus, Zap, Check, Info, Play } from 'lucide-react';
import { cn, formatTimeUntil } from '../lib/utils';

export function MockupsView() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Mock data to match AnimeCard expectations
  const mockAnime = {
    id: 1,
    title: { english: 'Jujutsu Kaisen', userPreferred: 'Jujutsu Kaisen' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg', large: '' },
    externalLinks: [{ site: 'Crunchyroll', url: '#' }],
    status: 'RELEASING',
    nextAiringEpisode: { episode: 12, airingAt: Math.floor(Date.now() / 1000) + 86400 }
  };

  const mockProgress = { watched: 11, aired: 11 };

  return (
    <div className="space-y-12 pb-24 w-full">
      <div className="border-b border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-white mb-2">UI Playground & Mockups</h1>
        <p className="text-gray-400">Concepting how to integrate intent-based watch statuses using our existing card designs.</p>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">AnimeCard: Dropdown Status Button</h2>
          <p className="text-sm text-gray-500 mb-4">
            Replacing the simple bookmark button with a unified button that opens a styled popover menu.
          </p>
        </div>

        <div className="flex gap-6 flex-wrap">
          
          {/* Current AnimeCard */}
          <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-gray-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl w-48 sm:w-56 border border-gray-800">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img src={mockAnime.coverImage.extraLarge} alt="Cover" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
              
              <button className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-purple-600 border border-white/10">
                <Bookmark className="h-4 w-4 fill-current" />
              </button>
              
              <div className="absolute bottom-0 left-0 w-full p-3 sm:p-4">
                <div className="absolute text-[10px] font-bold text-indigo-400 tracking-wider top-0 -translate-y-[200%] right-4 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/30">CURRENT</div>
                <h3 className="line-clamp-2 text-base sm:text-lg font-bold leading-tight text-white">Jujutsu Kaisen</h3>
                <div className="mt-1.5 flex items-center space-x-2 text-xs sm:text-sm text-gray-300">
                  <div className="flex items-center space-x-1 font-mono text-purple-400">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>Ep 12 in 1d</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col p-3 sm:p-4 bg-gray-900">
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>11 / 24</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full bg-emerald-500 w-[45%]" />
                </div>
              </div>
              
              <div className="mt-auto">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="flex items-center space-x-1 rounded-full bg-gray-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-300">
                    <PlayCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>Crunchyroll</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* New AnimeCard */}
          <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-gray-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl w-48 sm:w-56 border border-gray-800">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img src={mockAnime.coverImage.extraLarge} alt="Cover" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
              
              <div className="absolute right-3 top-3 z-20">
                <button 
                  onClick={() => setActiveMenu(activeMenu === 'card1' ? null : 'card1')}
                  className={cn(
                    "flex items-center gap-1.5 h-8 px-2.5 rounded-lg backdrop-blur-md transition-colors border",
                    activeMenu === 'card1' || true // Force active look for demo
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                      : "bg-black/50 border-white/10 text-gray-300 hover:bg-black/80 hover:text-white"
                  )}
                >
                  <Bookmark className="h-4 w-4 fill-current" />
                  <span className="text-xs font-semibold">Watching</span>
                </button>

                <div className={cn(
                  "absolute right-0 top-full mt-2 w-40 bg-[#2a2a2d] border border-gray-700 rounded-xl shadow-2xl overflow-hidden origin-top-right transition-all",
                  activeMenu === 'card1' ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
                )}>
                  <div className="p-1">
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 rounded-lg text-left">
                      <Bookmark className="w-4 h-4 fill-current" /> Watching
                    </button>
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg text-left transition-colors">
                      <Clock className="w-4 h-4" /> Plan to Watch
                    </button>
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg text-left transition-colors">
                      <Archive className="w-4 h-4" /> Shelved
                    </button>
                  </div>
                  <div className="h-px bg-gray-700"></div>
                  <div className="p-1">
                    <button className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg text-left transition-colors">
                      <XCircle className="w-4 h-4" /> Dropped
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 w-full p-3 sm:p-4">
                <div className="absolute text-[10px] font-bold text-green-400 tracking-wider top-0 -translate-y-[200%] right-4 bg-green-500/10 px-2 py-1 rounded-md border border-green-500/30">NEW</div>
                <h3 className="line-clamp-2 text-base sm:text-lg font-bold leading-tight text-white">Jujutsu Kaisen</h3>
                <div className="mt-1.5 flex items-center space-x-2 text-xs sm:text-sm text-gray-300">
                  <div className="flex items-center space-x-1 font-mono text-purple-400">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>Ep 12 in 1d</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col p-3 sm:p-4 bg-gray-900">
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>11 / 24</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full bg-emerald-500 w-[45%]" />
                </div>
              </div>
              
              <div className="mt-auto">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="flex items-center space-x-1 rounded-full bg-gray-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-300">
                    <PlayCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>Crunchyroll</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </section>

      
      <section className="space-y-6 pt-8 border-t border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">SeriesCard: Quick Status Changer</h2>
          <p className="text-sm text-gray-500 mb-4">
            Modifying the SeriesCard expanded view to use a dropdown for changing status of individual seasons instead of just plain text.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Current SeriesCard */}
          <div className="flex flex-col overflow-hidden rounded-xl bg-[#1c1c1f] border border-gray-800 transition-all hover:border-gray-700 relative">
            <div className="absolute text-[10px] font-bold text-indigo-400 tracking-wider top-2 right-12 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/30">CURRENT</div>
            <div className="flex p-4 gap-4 cursor-pointer">
              <div className="flex-1 min-w-0">
                <h3 className="truncate text-lg font-bold text-white mb-1">Bleach</h3>
                
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <div className="flex items-center gap-1 text-yellow-400 font-medium">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    8.5
                  </div>
                  <span className="capitalize">Watching</span>
                  <span>•</span>
                  <span>3 Seasons</span>
                  <span>•</span>
                  <span>30 / 54 Eps</span>
                </div>

                <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full transition-all duration-500 bg-purple-500" style={{ width: '55%' }} />
                </div>
              </div>
              <div className="flex items-center">
                <button className="p-2 text-gray-500 hover:text-white transition-colors">
                  <ChevronUp className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="border-t border-gray-800 bg-[#2a2a2d]/30">
              <div className="flex flex-col divide-y divide-gray-800/50 p-2">
                
                {/* Season Row 1 */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 1</span>
                    <span className="text-xs text-gray-500 truncate">The Substitute</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <span className="text-gray-400 w-16 text-right">20 / 20</span>
                    <span className="capitalize text-gray-400 w-24">Completed</span>
                    <span className="w-8 text-right text-yellow-400">85</span>
                  </div>
                </div>
                
                {/* Season Row 2 */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 2</span>
                    <span className="text-xs text-gray-500 truncate">Soul Society</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <span className="text-gray-400 w-16 text-right">10 / 21</span>
                    <span className="capitalize text-gray-400 w-24">Watching</span>
                    <span className="w-8 text-right text-gray-600">-</span>
                  </div>
                </div>

                {/* Season Row 3 (Not Tracking) */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 3</span>
                    <span className="text-xs text-gray-500 truncate">Hueco Mundo</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <button className="flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-md transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Add to List
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* New SeriesCard */}
          <div className="flex flex-col overflow-hidden rounded-xl bg-[#1c1c1f] border border-gray-800 transition-all hover:border-gray-700 relative">
            <div className="absolute text-[10px] font-bold text-green-400 tracking-wider top-2 right-12 bg-green-500/10 px-2 py-1 rounded-md border border-green-500/30">NEW</div>
            <div className="flex p-4 gap-4 cursor-pointer">
              <div className="flex-1 min-w-0">
                <h3 className="truncate text-lg font-bold text-white mb-1">Bleach</h3>
                
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <div className="flex items-center gap-1 text-yellow-400 font-medium">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    8.5
                  </div>
                  <span className="capitalize">Watching</span>
                  <span>•</span>
                  <span>3 Seasons</span>
                  <span>•</span>
                  <span>30 / 54 Eps</span>
                </div>

                <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full transition-all duration-500 bg-purple-500" style={{ width: '55%' }} />
                </div>
              </div>
              <div className="flex items-center">
                <button className="p-2 text-gray-500 hover:text-white transition-colors">
                  <ChevronUp className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="border-t border-gray-800 bg-[#2a2a2d]/30">
              <div className="flex flex-col divide-y divide-gray-800/50 p-2">
                
                {/* Season Row 1 */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg group">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 1</span>
                    <span className="text-xs text-gray-500 truncate">The Substitute</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <span className="text-gray-400 w-16 text-right">20 / 20</span>
                    
                    {/* New Dropdown */}
                    <div className="relative">
                      <select defaultValue="completed" className="appearance-none bg-transparent hover:bg-gray-700 text-emerald-400 font-medium px-2 py-1 pr-6 rounded-md cursor-pointer outline-none border border-transparent hover:border-gray-600 transition-colors">
                        <option value="watching">Watching</option>
                        <option value="plan_to_watch">Plan to Watch</option>
                        <option value="completed">Completed</option>
                        <option value="dropped">Dropped</option>
                        <option value="on_hold">Shelved</option>
                        <option value="remove">Remove</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>

                    <span className="w-8 text-right text-yellow-400">85</span>
                  </div>
                </div>
                
                {/* Season Row 2 */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg group">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 2</span>
                    <span className="text-xs text-gray-500 truncate">Soul Society</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <span className="text-gray-400 w-16 text-right">10 / 21</span>
                    
                    {/* New Dropdown */}
                    <div className="relative">
                      <select defaultValue="watching" className="appearance-none bg-transparent hover:bg-gray-700 text-indigo-400 font-medium px-2 py-1 pr-6 rounded-md cursor-pointer outline-none border border-transparent hover:border-gray-600 transition-colors">
                        <option value="watching">Watching</option>
                        <option value="plan_to_watch">Plan to Watch</option>
                        <option value="completed">Completed</option>
                        <option value="dropped">Dropped</option>
                        <option value="on_hold">Shelved</option>
                        <option value="remove">Remove</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>

                    <span className="w-8 text-right text-gray-600">-</span>
                  </div>
                </div>

                {/* Season Row 3 (Not Tracking) */}
                <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/50 rounded-lg group">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-sm font-medium text-gray-200 cursor-pointer hover:underline hover:text-purple-400">Season 3</span>
                    <span className="text-xs text-gray-500 truncate">Hueco Mundo</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                    <button className="flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-md transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Add to List
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="space-y-6 pt-8 border-t border-gray-800">
         <div>
          <h2 className="text-xl font-bold text-white">Daily Schedule List Items</h2>
          <p className="text-sm text-gray-500 mb-4">Adding a compact status toggle to the list items in the Schedule view.</p>
        </div>

        <div className="max-w-xl bg-gray-900 rounded-xl border border-gray-800 p-2 space-y-1">
          {/* List Item Mockup */}
          <div className="flex items-center gap-4 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
            <img src={mockAnime.coverImage.extraLarge} className="w-12 h-12 rounded object-cover" />
            <div className="flex-1 min-w-0">
               <h4 className="font-semibold text-white truncate text-sm">Jujutsu Kaisen</h4>
               <p className="text-xs text-gray-400">Ep 12 at 4:00 PM</p>
            </div>
            
            {/* Quick Status Pill/Dropdown for List */}
            <div className="relative">
              <button 
                onClick={() => setActiveMenu(activeMenu === 'list1' ? null : 'list1')}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors text-xs font-medium"
              >
                Watching <ChevronDown className="w-3 h-3" />
              </button>
              
               <div className={cn(
                  "absolute right-0 top-full mt-1 w-36 bg-[#2a2a2d] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10 transition-all",
                  activeMenu === 'list1' ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
                )}>
                  <div className="p-1">
                    <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded text-left">
                      <Clock className="w-3 h-3" /> Plan to Watch
                    </button>
                    <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded text-left">
                      <Archive className="w-3 h-3" /> Shelve
                    </button>
                  </div>
                </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
            <img src="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21459-oZMhncYvsUwg.jpg" className="w-12 h-12 rounded object-cover" />
            <div className="flex-1 min-w-0">
               <h4 className="font-semibold text-white truncate text-sm">Boku no Hero</h4>
               <p className="text-xs text-gray-400">Ep 134 at 5:30 PM</p>
            </div>
            
            <button className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700 bg-transparent text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      </section>

      
      <section className="space-y-6 pt-8 border-t border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">Active Watch Cards (Based on Screenshot)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Faithful recreation of the dense, horizontal card layout.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          
          {/* Card 1 */}
          <div className="flex flex-col rounded-xl bg-[#0a0a0f] border border-[#1e1e28] p-4 relative">
            <div className="flex gap-4">
              {/* Thumbnail with red badge */}
              <div className="relative shrink-0">
                <div className="w-[84px] h-[120px] rounded-lg overflow-hidden">
                  <img src={mockAnime.coverImage.extraLarge} className="w-full h-full object-cover" alt="Cover" />
                </div>
                <div className="absolute -top-2 -right-2 bg-[#f43f5e] text-white text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#0a0a0f]">
                  2
                </div>
              </div>
              
              {/* Info & Progress */}
              <div className="flex flex-col flex-1 min-w-0 py-1">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-white text-[15px] leading-tight mb-2 line-clamp-2">
                      The Duke's Son Claims He Won't Love Me Yet Showers Me with Adoration
                    </h3>
                    <div className="flex items-center gap-2 text-[12px] font-medium mb-3">
                      <span className="text-gray-400">2 / 4 logged</span>
                      <span className="bg-[#1e1b4b] text-[#818cf8] px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide">NEW</span>
                      <span className="text-[#eab308] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Next in 17h
                      </span>
                    </div>
                  </div>
                  
                  {/* Circle Progress */}
                  <div className="shrink-0 w-12 h-12 rounded-full border-4 border-[#1e1e28] flex items-center justify-center relative">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle cx="20" cy="20" r="20" className="stroke-[#1e1e28] fill-none stroke-[4]" />
                      <circle cx="20" cy="20" r="20" className="stroke-[#8b5cf6] fill-none stroke-[4]" strokeDasharray="125.6" strokeDashoffset="62.8" />
                    </svg>
                    <span className="text-[12px] font-bold text-white z-10">50%</span>
                  </div>
                </div>
                
                {/* Horizontal Progress Bar */}
                <div className="mt-auto">
                  <div className="flex gap-1 h-1.5 mb-1.5">
                    <div className="h-full bg-[#8b5cf6] rounded-l-full w-1/4"></div>
                    <div className="h-full bg-[#8b5cf6] w-1/4"></div>
                    <div className="h-full bg-[#1e1e28] w-1/4"></div>
                    <div className="h-full bg-[#1e1e28] rounded-r-full w-1/4"></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500 font-medium">
                    <span>50% overall progress</span>
                    <span>2 left</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#1e1e28] my-4"></div>

            {/* Actions Section */}
            <div className="flex flex-col">
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <Zap className="w-3.5 h-3.5 text-[#8b5cf6] fill-current" />
                <span className="text-[13px] font-bold text-[#8b5cf6]">Rate Episode 3</span>
              </div>
              
              <div className="flex gap-2 mb-3">
                {[5, 6, 7, 8, 9, 10].map(s => (
                  <button key={s} className="flex-1 h-10 rounded-lg border border-[#1e1e28] bg-transparent hover:bg-[#1e1e28] text-white text-[15px] font-semibold transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2 h-11">
                <button className="flex items-center justify-center gap-1.5 px-3 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                  <ChevronDown className="w-3.5 h-3.5" /> 0-4
                </button>
                <button className="flex items-center justify-center gap-1.5 px-4 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                  Watched only <Info className="w-3.5 h-3.5" />
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-bold transition-colors">
                  <Play className="w-4 h-4 fill-current" /> Continue Ep 3
                </button>
              </div>
            </div>
          </div>
          
          {/* Card 2 */}
          <div className="flex flex-col rounded-xl bg-[#0a0a0f] border border-[#1e1e28] p-4 relative">
            <div className="flex gap-4">
              {/* Thumbnail with red badge */}
              <div className="relative shrink-0">
                <div className="w-[84px] h-[120px] rounded-lg overflow-hidden">
                  <img src={mockAnime.coverImage.extraLarge} className="w-full h-full object-cover" alt="Cover" />
                </div>
                <div className="absolute -top-2 -right-2 bg-[#f43f5e] text-white text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#0a0a0f]">
                  2
                </div>
              </div>
              
              {/* Info & Progress */}
              <div className="flex flex-col flex-1 min-w-0 py-1">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-white text-[15px] leading-tight mb-2 line-clamp-2">
                      Hanaori-san Still Wants to Fight in the Next Life
                    </h3>
                    <div className="flex items-center gap-2 text-[12px] font-medium mb-3">
                      <span className="text-gray-400">1 / 3 logged</span>
                      <span className="bg-[#1e1b4b] text-[#818cf8] px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide">NEW</span>
                      <span className="text-[#eab308] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Next in 17h
                      </span>
                    </div>
                  </div>
                  
                  {/* Circle Progress */}
                  <div className="shrink-0 w-12 h-12 rounded-full border-4 border-[#1e1e28] flex items-center justify-center relative">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle cx="20" cy="20" r="20" className="stroke-[#1e1e28] fill-none stroke-[4]" />
                      <circle cx="20" cy="20" r="20" className="stroke-[#8b5cf6] fill-none stroke-[4]" strokeDasharray="125.6" strokeDashoffset="83.73" />
                    </svg>
                    <span className="text-[12px] font-bold text-white z-10">33%</span>
                  </div>
                </div>
                
                {/* Horizontal Progress Bar */}
                <div className="mt-auto">
                  <div className="flex gap-1 h-1.5 mb-1.5">
                    <div className="h-full bg-[#8b5cf6] rounded-l-full w-[33%]"></div>
                    <div className="h-full bg-[#1e1e28] w-[33%]"></div>
                    <div className="h-full bg-[#1e1e28] rounded-r-full w-[33%]"></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500 font-medium">
                    <span>33% overall progress</span>
                    <span>2 left</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#1e1e28] my-4"></div>

            {/* Actions Section */}
            <div className="flex flex-col">
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <Zap className="w-3.5 h-3.5 text-[#8b5cf6] fill-current" />
                <span className="text-[13px] font-bold text-[#8b5cf6]">Rate Episode 2</span>
              </div>
              
              <div className="flex gap-2 mb-3">
                {[5, 6, 7, 8, 9, 10].map(s => (
                  <button key={s} className="flex-1 h-10 rounded-lg border border-[#1e1e28] bg-transparent hover:bg-[#1e1e28] text-white text-[15px] font-semibold transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2 h-11">
                <button className="flex items-center justify-center gap-1.5 px-3 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                  <ChevronDown className="w-3.5 h-3.5" /> 0-4
                </button>
                <button className="flex items-center justify-center gap-1.5 px-4 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                  Watched only <Info className="w-3.5 h-3.5" />
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-bold transition-colors">
                  <Play className="w-4 h-4 fill-current" /> Continue Ep 2
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Wide Series Card (Polar Opposites) */}
        <div className="mt-4 flex flex-col rounded-xl bg-[#0a0a0f] border border-[#1e1e28] p-4 relative">
          <div className="flex gap-4">
            {/* Thumbnail */}
            <div className="w-[100px] h-[140px] rounded-lg overflow-hidden shrink-0">
              <img src={mockAnime.coverImage.extraLarge} className="w-full h-full object-cover" alt="Cover" />
            </div>

            {/* Info */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-bold text-white text-[18px]">You and I Are Polar Opposites</h3>
                    <span className="border border-[#1e1e28] text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                      2 SEASONS
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-gray-400 font-medium">
                    <Play className="w-3.5 h-3.5 text-[#8b5cf6] fill-current" />
                    <span className="text-[#e2e8f0]">Continue in order</span>
                    <span>•</span>
                    <span>Next up: S1 - Ep 9</span>
                  </div>
                </div>

                {/* Circle Progress */}
                <div className="shrink-0 w-12 h-12 rounded-full border-4 border-[#1e1e28] flex items-center justify-center relative">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="20" cy="20" r="20" className="stroke-[#1e1e28] fill-none stroke-[4]" />
                    <circle cx="20" cy="20" r="20" className="stroke-[#8b5cf6] fill-none stroke-[4]" strokeDasharray="125.6" strokeDashoffset="62.8" />
                  </svg>
                  <span className="text-[12px] font-bold text-white z-10">50%</span>
                </div>
              </div>

              {/* Seasons Progress */}
              <div className="mt-auto space-y-4">
                {/* Season 1 */}
                <div className="flex items-center gap-4">
                  <div className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-[#1e1e28]">
                    <Play className="w-3 h-3 text-white fill-current ml-0.5" />
                  </div>
                  <span className="font-bold text-white text-[13px] w-16">Season 1</span>
                  
                  <div className="flex-1 flex gap-1 h-1.5">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className={`h-full flex-1 rounded-full ${i < 8 ? 'bg-[#8b5cf6]' : 'bg-[#1e1e28]'}`}></div>
                    ))}
                  </div>

                  <span className="text-[12px] text-gray-400 font-medium w-10 text-right">8 / 12</span>
                  <button className="border border-[#1e1e28] bg-transparent text-gray-300 px-3 py-1 rounded text-[11px] font-semibold hover:bg-[#1e1e28] transition-colors">
                    Current
                  </button>
                </div>

                {/* Season 2 */}
                <div className="flex items-center gap-4">
                  <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                  <span className="font-bold text-white text-[13px] w-16">Season 2</span>
                  
                  <div className="flex-1 flex gap-1 h-1.5">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-full flex-1 rounded-full bg-[#1e1e28]"></div>
                    ))}
                  </div>

                  <span className="text-[12px] text-gray-400 font-medium w-10 text-right">0 / 4</span>
                  <button className="text-gray-500 px-3 py-1 rounded text-[11px] font-semibold">
                    Up Next
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="h-px bg-[#1e1e28] my-4"></div>

          {/* Bottom Action Area */}
          <div className="flex flex-col max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-center gap-1.5 mb-3">
              <Zap className="w-3.5 h-3.5 text-[#8b5cf6] fill-current" />
              <span className="text-[13px] font-bold text-[#8b5cf6]">Rate S1 Ep 9</span>
            </div>
            
            <div className="flex gap-2 mb-4 justify-center">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                <button key={s} className="w-10 h-10 rounded-lg border border-[#1e1e28] bg-transparent hover:bg-[#1e1e28] text-white text-[14px] font-semibold transition-colors flex items-center justify-center">
                  {s}
                </button>
              ))}
            </div>
            
            <div className="flex gap-2 h-11 w-full">
              <button className="flex items-center justify-center gap-1.5 px-3 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                <ChevronDown className="w-3.5 h-3.5" /> 0-4
              </button>
              <button className="flex items-center justify-center gap-1.5 px-4 rounded-lg border border-[#1e1e28] text-gray-400 text-[12px] font-medium shrink-0">
                Watched only <Info className="w-3.5 h-3.5" />
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-bold transition-colors">
                <Play className="w-4 h-4 fill-current" /> Continue S1 Ep 9
              </button>
            </div>
          </div>

        </div>
      </section>
<section className="space-y-6 pt-8 border-t border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">Catch Up Queue</h2>
          <p className="text-sm text-gray-500 mb-4">
            A compact, action-oriented list of episodes the user is behind on, prioritized by release date or watch status.
          </p>
        </div>

        <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 hide-scrollbar">
          {[
            {
              title: "Jujutsu Kaisen",
              ep: 11,
              titleEp: "降霊 (Séance)",
              behind: 2,
              airDate: "3 days ago"
            },
            {
              title: "Kaiju No. 8",
              ep: 4,
              titleEp: "Fortitude 9.8",
              behind: 1,
              airDate: "Yesterday"
            },
            {
              title: "Frieren: Beyond Journey's End",
              ep: 28,
              titleEp: "It Would Be Embarrassing When We Met Again",
              behind: 4,
              airDate: "1 week ago"
            }
          ].map((item, idx) => (
            <div key={idx} className="group flex items-center gap-4 p-3 pr-4 rounded-xl bg-[#13141c] border border-gray-800/60 hover:border-gray-700 hover:bg-[#181922] transition-all shrink-0 w-[500px]">
              {/* Thumbnail */}
              <div className="relative w-32 h-20 shrink-0 rounded-lg overflow-hidden bg-[#0c0d14]">
                <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[13px] font-medium text-gray-400">
                  {item.title}
                </div>
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                  24m
                </div>
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[15px] font-bold text-gray-100 truncate">{item.title}</h3>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                    {item.behind} eps behind
                  </span>
                </div>
                <div className="text-[13px] text-gray-400 truncate mb-1">
                  <span className="text-gray-200 font-medium">Episode {item.ep}</span> • {item.titleEp}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Aired {item.airDate}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-transparent text-[13px] font-medium text-gray-300 hover:bg-gray-800 transition-colors">
                  <Check className="w-4 h-4" /> Mark Watched
                </button>
                <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-indigo-500/30 bg-[#242145]/80 text-[13px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                  <Play className="w-4 h-4 fill-current" /> Watch
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
