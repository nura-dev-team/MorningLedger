/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nura: {
          bg:           '#FAF9F7',
          surface:      '#FFFFFF',
          'surface-alt':'#F4F3EF',
          border:       '#E6E4DE',
          text:         '#1B1A17',
          'text-2':     '#5A5850',
          'text-3':     '#8E8B80',
          'text-4':     '#B5B2A8',
          green:        '#2E7D56',
          'green-bg':   '#EEF7F1',
          'green-border':'#C6E8D4',
          amber:        '#B8860B',
          'amber-bg':   '#FFF9ED',
          'amber-border':'#F5DFA0',
          orange:       '#C2652A',
          'orange-bg':  '#FFF3EB',
          red:          '#A63D2F',
          'red-bg':     '#FDF0ED',
          blue:         '#3366CC',
          'blue-bg':    '#EDF3FF',
          'blue-border':'#C5D8F5',
        },
      },
      fontFamily: {
        dm:         ['"DM Sans"', 'sans-serif'],
        newsreader: ['"Newsreader"', 'serif'],
      },
      borderRadius: {
        nura:    '14px',
        'nura-sm': '10px',
        'nura-lg': '18px',
      },
    },
  },
  plugins: [],
}
