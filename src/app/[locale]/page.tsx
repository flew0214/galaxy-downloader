import { getDictionary } from "@/lib/i18n"
import type { Locale } from "@/lib/i18n/config"
import Link from "next/link"
import { StructuredData } from "@/components/structured-data"
import { UnifiedDownloaderClient } from "./unified-downloader-client"
import { pickHomeDictionary } from "@/lib/i18n/home-dictionary"
import { QuickStartCard } from "@/components/downloader/QuickStartCard"
import { PlatformGuideCard } from "@/components/downloader/PlatformGuideCard"
import { FreeSupportCard } from "@/components/downloader/FreeSupportCard"
import { ViewportSideRailAd } from "@/components/ads/viewport-side-rail-ad"
import { SideRailAd } from "@/components/ads/side-rail-ad"

export default async function HomePage({
    params,
}: {
    params: Promise<{ locale: Locale }>
}) {
    const { locale } = await params
    const dict = await getDictionary(locale)
    const homeDict = pickHomeDictionary(dict)
    const seoCopy = locale === 'en'
        ? {
            trustLabel: 'Trust & Policies',
            privacyLabel: 'Privacy Policy',
            termsLabel: 'Terms of Use',
            contactLabel: 'Contact',
        }
        : locale === 'zh-tw'
          ? {
              trustLabel: '信任與政策',
              privacyLabel: '隱私政策',
              termsLabel: '使用條款',
              contactLabel: '聯絡我們',
          }
          : {
              trustLabel: '信任与政策',
              privacyLabel: '隐私政策',
              termsLabel: '使用条款',
              contactLabel: '联系我们',
          }

    return (
        <>
            <StructuredData locale={locale} dict={dict} />
            <UnifiedDownloaderClient
                dict={homeDict}
                locale={locale}
                leftRail={
                    <>
                        <QuickStartCard dict={dict} />
                        <FreeSupportCard dict={dict} />
                        <ViewportSideRailAd slot="1341604736" showOn="desktop" />
                    </>
                }
                rightRail={
                    <>
                        <PlatformGuideCard dict={dict} />
                        <ViewportSideRailAd slot="6380909506" showOn="desktop" />
                    </>
                }
                mobileAd={
                    <SideRailAd slot="5740014745" />
                }
                mobileGuides={
                    <>
                        <QuickStartCard dict={dict} />
                        <FreeSupportCard dict={dict} />
                        <PlatformGuideCard dict={dict} />
                    </>
                }
                heroMeta={
                    <p className="text-center text-xs text-muted-foreground ">
                        {dict.page.feedback}
                    </p>
                }
                footer={
                    <footer className="border-t bg-muted/30 py-6 mt-8">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
                            <div className="text-center text-xs text-muted-foreground space-y-1">
                                <p className="text-yellow-600 font-medium">{dict.page.copyrightBilibiliRestriction}</p>
                                <p>
                                    <Link className="underline" href={`/${locale}/faq`} prefetch={false}>
                                        {dict.page.faqLinkText}
                                    </Link>
                                </p>
                                <p>
                                    {seoCopy.trustLabel}
                                    {': '}
                                    <Link className="underline" href={`/${locale}/privacy`} prefetch={false}>
                                        {seoCopy.privacyLabel}
                                    </Link>
                                    {' · '}
                                    <Link className="underline" href={`/${locale}/terms`} prefetch={false}>
                                        {seoCopy.termsLabel}
                                    </Link>
                                    {' · '}
                                    <Link className="underline" href={`/${locale}/contact`} prefetch={false}>
                                        {seoCopy.contactLabel}
                                    </Link>
                                </p>
                                <p>{dict.page.copyrightVideo}</p>
                                <p>{dict.page.copyrightStorage}</p>
                                <p>{dict.page.copyrightYear}</p>
                            </div>
                        </div>
                    </footer>
                }
            />
        </>
    )
} 
