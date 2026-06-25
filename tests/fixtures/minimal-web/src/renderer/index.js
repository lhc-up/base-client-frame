const banner = document.createElement('div');
banner.id = 'banner';
banner.textContent = `target=${__BC_BUILD__.target}, env=${__BC_BUILD__.env}, api=${process.env.BC_API_BASE}`;
document.body.appendChild(banner);
