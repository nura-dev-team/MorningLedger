import { useNavigate } from 'react-router-dom'

const cards = [
  {
    label: "I'll set it up myself",
    desc: 'I know my numbers and I am ready to enter them now',
    to: '/onboarding',
  },
  {
    label: 'My Controller handles this',
    desc: 'I will invite my Controller to configure budgets and GL setup',
    to: '/onboarding/delegate',
  },
]

const DelegationFork = () => {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--nbg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div
          className="font-newsreader"
          style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--nt)', textAlign: 'center', marginBottom: '8px' }}
        >
          NURA
        </div>
        <div style={{ fontSize: '14px', color: 'var(--nt3)', textAlign: 'center', marginBottom: '32px', lineHeight: '1.6' }}>
          How would you like to get set up?
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {cards.map((card) => (
            <div
              key={card.to}
              onClick={() => navigate(card.to)}
              style={{
                background: 'var(--nsurf)',
                border: '1px solid var(--nborder)',
                borderRadius: 'var(--r, 12px)',
                padding: '28px 20px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--nt)'
                e.currentTarget.style.background = 'var(--nsurf-alt)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--nborder)'
                e.currentTarget.style.background = 'var(--nsurf)'
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--nt)', marginBottom: '8px', lineHeight: '1.3' }}>
                {card.label}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--nt3)', lineHeight: '1.5' }}>
                {card.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DelegationFork
