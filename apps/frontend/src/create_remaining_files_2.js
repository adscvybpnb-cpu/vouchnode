const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\alraya\\Desktop\\hooh\\apps\\frontend\\src';

const files = {
  // 1. Seller Profile
  'app/(public)/sellers/[username]/page.tsx': `'use client';
import { useQuery } from '@tanstack/react-query';
import { sellerService } from '@/services/seller.service';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SellerProfilePage({ params }: { params: { username: string } }) {
  const { data: seller, isLoading } = useQuery({
    queryKey: ['seller', params.username],
    queryFn: () => sellerService.getSeller(params.username)
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (!seller) return <div>Seller not found</div>;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="h-64 w-full bg-gradient-to-r from-indigo-900/40 to-purple-900/20"></div>
      <div className="container mx-auto px-4 -mt-16">
        <div className="bg-[#141420] rounded-xl p-6 border border-[#1E1E2E]">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                {seller.shopName}
              </h1>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  'app/(public)/become-a-seller/page.tsx': \`export default function BecomeASellerPage() { return <div className="text-white">Become a Seller</div>; }\`,
  'app/(buyer)/dashboard/orders/page.tsx': \`export default function BuyerOrdersPage() { return <div className="text-white">Buyer Orders</div>; }\`,
  'app/(seller)/layout.tsx': \`export default function SellerLayout({ children }: { children: React.ReactNode }) { return <div className="text-white">{children}</div>; }\`,
  'app/(admin)/layout.tsx': \`export default function AdminLayout({ children }: { children: React.ReactNode }) { return <div className="text-white">{children}</div>; }\`,
};

const paths = [
  'app/(buyer)/dashboard/orders/[id]/page.tsx',
  'app/(buyer)/dashboard/wallet/page.tsx',
  'app/(buyer)/dashboard/wallet/deposit/page.tsx',
  'app/(buyer)/dashboard/wallet/withdraw/page.tsx',
  'app/(buyer)/dashboard/messages/page.tsx',
  'app/(buyer)/dashboard/disputes/page.tsx',
  'app/(buyer)/dashboard/disputes/[id]/page.tsx',
  'app/(buyer)/dashboard/reviews/page.tsx',
  'app/(buyer)/dashboard/notifications/page.tsx',
  'app/(buyer)/dashboard/profile/page.tsx',
  'app/(buyer)/dashboard/security/page.tsx',
  'app/(seller)/seller/products/page.tsx',
  'app/(seller)/seller/products/new/page.tsx',
  'app/(seller)/seller/products/[id]/edit/page.tsx',
  'app/(seller)/seller/orders/page.tsx',
  'app/(seller)/seller/wallet/page.tsx',
  'app/(seller)/seller/messages/page.tsx',
  'app/(seller)/seller/reviews/page.tsx',
  'app/(seller)/seller/disputes/page.tsx',
  'app/(seller)/seller/settings/page.tsx',
  'app/(admin)/admin/page.tsx',
  'app/(admin)/admin/users/page.tsx',
  'app/(admin)/admin/sellers/page.tsx',
  'app/(admin)/admin/products/page.tsx',
  'app/(admin)/admin/orders/page.tsx',
  'app/(admin)/admin/transactions/page.tsx',
  'app/(admin)/admin/disputes/page.tsx',
  'app/(admin)/admin/disputes/[id]/page.tsx',
  'app/(admin)/admin/reports/page.tsx',
  'app/(admin)/admin/fraud/page.tsx',
  'app/(admin)/admin/audit-logs/page.tsx',
  'app/(admin)/admin/settings/page.tsx',
];

paths.forEach(p => {
  if (!files[p]) {
    files[p] = "export default function Page() { return <div className='text-white'>Placeholder for " + p + "</div>; }";
  }
});

const componentPaths = [
  'components/marketplace/ProductFilters.tsx',
  'components/marketplace/SellerCard.tsx',
  'components/marketplace/DiscountBadge.tsx',
  'components/marketplace/DeliveryBadge.tsx',
  'components/marketplace/PriceDisplay.tsx',
  'components/marketplace/CategoryMenu.tsx',
  'components/homepage/HeroSection.tsx',
  'components/homepage/TrendingProducts.tsx',
  'components/homepage/BestSellers.tsx',
  'components/homepage/NewArrivals.tsx',
  'components/homepage/InstantDelivery.tsx',
  'components/homepage/CategorySection.tsx',
  'components/homepage/SellerHighlights.tsx',
  'components/order/OrderCard.tsx',
  'components/order/OrderStatus.tsx',
  'components/order/OrderTimeline.tsx',
  'components/order/OrderWorkspace.tsx',
  'components/wallet/TransactionHistory.tsx',
  'components/wallet/WithdrawForm.tsx',
  'components/chat/ConversationList.tsx',
  'components/chat/ChatInput.tsx',
  'components/chat/ChatMessage.tsx',
  'components/admin/StatsCard.tsx',
  'components/admin/DataTable.tsx',
  'components/admin/RevenueChart.tsx',
  'components/layout/SellerSidebar.tsx',
  'components/layout/AdminSidebar.tsx'
];

componentPaths.forEach(p => {
  if (!files[p]) {
    const compName = path.basename(p, '.tsx');
    files[p] = "export function " + compName + "() { return <div>" + compName + "</div>; }";
  }
});

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(srcDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}
console.log('Created all remaining ' + Object.keys(files).length + ' items.');
