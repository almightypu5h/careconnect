document.addEventListener('DOMContentLoaded', () => {
    const donationForm = document.getElementById('donation-form');
    const medicinesList = document.getElementById('medicines');

    const medicines = [];

    donationForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const medicineName = document.getElementById('medicineName').value;
        const quantity = document.getElementById('quantity').value;

        if (medicineName && quantity) {
            const newMedicine = { name: medicineName, quantity: parseInt(quantity, 10) };
            medicines.push(newMedicine);
            updateMedicinesList();
            donationForm.reset();
        } else {
            alert('Please fill in all fields.');
        }
    });

    function updateMedicinesList() {
        medicinesList.innerHTML = '';
        medicines.forEach((medicine, index) => {
            const li = document.createElement('li');
            li.textContent = `${medicine.name} - ${medicine.quantity}`;
            medicinesList.appendChild(li);
        });
    }
});