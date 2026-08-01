const fs = require('fs');
const content = fs.readFileSync('src/components/MockupsView.tsx', 'utf8');

// I will replace the entire "Today's Drops Card" section with a faithful recreation of the screenshot.
const newCardsSection = `
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
                      <div key={i} className={\`h-full flex-1 rounded-full \${i < 8 ? 'bg-[#8b5cf6]' : 'bg-[#1e1e28]'}\`}></div>
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
`;

const regex = /<section className="space-y-6 pt-8 border-t border-gray-800">\s*<div>\s*<h2 className="text-xl font-bold text-white">Today's Drops Card<\/h2>[\s\S]*?(?=<section className="space-y-6 pt-8 border-t border-gray-800">)/;

let replaced = content.replace(regex, newCardsSection);

if (replaced === content) {
  console.log("Failed to match Regex for replacing Drops Card");
} else {
  fs.writeFileSync('src/components/MockupsView.tsx', replaced);
  console.log("Success");
}
