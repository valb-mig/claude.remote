import { ActivityGrid } from '@/components/home/activity-grid'
import { Greeting } from '@/components/home/greeting'
import { Limits } from '@/components/home/limits'
import { Now } from '@/components/home/now'
import { RecentProjects } from '@/components/home/recent-projects'
import { UsageCharts } from '@/components/home/usage-charts'
import { useActivity } from '@/lib/activity'

/**
 * A tela inicial: saudação e os painéis (o que pede você, limites, o ano em quadradinhos, os últimos
 * 30 dias e os projetos). No PC, duas colunas; a saudação alinha com elas.
 */
export function HomePage() {
  const activity = useActivity()
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10 compact:pt-3">
      <Greeting />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Now />
        <Limits />
        <ActivityGrid days={activity?.days ?? null} className="lg:col-span-2" />
        <UsageCharts activity={activity} />
        <RecentProjects activity={activity} />
      </div>
    </div>
  )
}
