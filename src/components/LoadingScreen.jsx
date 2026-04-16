const LoadingScreen = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: 'var(--bg)',
      flexDirection: 'column',
      animation: 'fadeIn 600ms ease forwards',
    }}
  >
    <div
      style={{
        fontFamily: "'Newsreader', serif",
        fontSize: '28px',
        letterSpacing: '8px',
        textTransform: 'uppercase',
        color: 'var(--text)',
      }}
    >
      NURA
    </div>
    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>
  </div>
)

export default LoadingScreen
