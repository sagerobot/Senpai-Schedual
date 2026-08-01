const fs = require('fs');
const content = fs.readFileSync('src/components/MockupsView.tsx', 'utf8');

const regex = /<section className="space-y-6 pt-8 border-t border-gray-800">\s*<div>\s*<h2 className="text-xl font-bold text-white">SeriesCard: Quick Status Changer<\/h2>[\s\S]*?(?=<section className="space-y-6 pt-8 border-t border-gray-800">)/;

const newSection = `
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
`;

const updated = content.replace(regex, newSection + '\n\n      ');
fs.writeFileSync('src/components/MockupsView.tsx', updated);
