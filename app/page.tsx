"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Home() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Welcome to Ultra POS</h1>
          <p className="text-muted-foreground text-lg">
            Modern Point of Sale System with Royal Blue Theme
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Total Sales", value: "$12,345", icon: "💰" },
            { label: "Orders Today", value: "42", icon: "📦" },
            { label: "Customers", value: "238", icon: "👥" },
            { label: "Inventory", value: "1,245", icon: "📊" },
          ].map((stat, idx) => (
            <Card key={idx} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-primary">{stat.value}</p>
                  </div>
                  <div className="text-3xl">{stat.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Demo Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Theme Components Demo</CardTitle>
            <CardDescription>Try out the Royal Blue themed components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Button Variants */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Button Variants:</h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>

            {/* Button Sizes */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Button Sizes:</h3>
              <div className="flex flex-wrap gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            {/* Input Fields */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Input Fields:</h3>
              <div className="flex flex-col gap-3">
                <Input placeholder="Enter product name..." />
                <Input placeholder="Enter price..." type="number" />
                <Input placeholder="Search..." disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Color Palette Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Royal Blue Color Palette</CardTitle>
            <CardDescription>Reference for all theme colors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { name: "Primary", color: "bg-primary" },
                { name: "Primary Dark", color: "bg-primary-dark" },
                { name: "Primary Light", color: "bg-primary-light" },
                { name: "Accent", color: "bg-accent" },
                { name: "Success", color: "bg-success" },
                { name: "Error", color: "bg-error" },
              ].map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className={`${item.color} h-24 rounded-md shadow-sm`} />
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
