const LoadingScreen = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: 'var(--nbg)',
      flexDirection: 'column',
      gap: '16px',
    }}
  >
    <div
      style={{
        fontFamily: "'Newsreader', serif",
        fontSize: '13px',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        color: 'var(--nt4)',
      }}
    >
      NURA
    </div>
  </div>
)

export default LoadingScreen
