import ImportForm from './ImportForm';

export const dynamic = 'force-dynamic';

export default function ImportPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Importer un tableau</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Colle le JSON produit par le bookmarklet ATP. Le même tournoi peut être
          réimporté après chaque tour : les données sont mises à jour (upsert),
          pas dupliquées.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
