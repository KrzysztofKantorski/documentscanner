import { CvUploadForm, type JobOffer } from './features/cv-upload/CvUploadForm'
import './App.css'

// Stand-in until the job board passes the chosen offer to this screen.
const SAMPLE_OFFER: JobOffer = {
  id: 'offer-dotnet-azure',
  title: 'Junior .NET Developer (Azure)',
  company: 'Contoso Software',
  location: 'Gliwice / zdalnie',
}

function App() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          DocumentScanner
        </a>
      </header>
      <main className="page">
        <div className="page-intro">
          <h1>Wyślij CV</h1>
          <p>
            Uzupełnij dane i dodaj CV. Sprawdzimy, jak bardzo pasuje do oferty, i podpowiemy, co w
            nim poprawić.
          </p>
        </div>
        <CvUploadForm offer={SAMPLE_OFFER} />
      </main>
    </>
  )
}

export default App
