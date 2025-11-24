"use client";

export const Navbar = () => {
  return (
    <nav className="bg-primary text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold">Ultra POS</h1>
            <ul className="hidden md:flex gap-6">
              <li>
                <a href="#" className="hover:text-primary-light transition-colors">
                  Dashboard
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-light transition-colors">
                  Products
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-light transition-colors">
                  Transactions
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary-light transition-colors">
                  Reports
                </a>
              </li>
            </ul>
          </div>
          <div className="flex items-center gap-4">
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-md transition-colors">
              Account
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
